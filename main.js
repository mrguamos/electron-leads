// Modules to control application life and create native browser window
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const puppeteer = require('puppeteer');
const Excel = require('exceljs')
const home = require("os").homedir();
const fs = require('fs');
const dir = home + '/leads';
const { Sequelize, Model, DataTypes, Op, QueryTypes } = require('sequelize');
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: dir + "/leads.sqlite", // or ':memory:'
  //logging: false,
});
const dialog = require('electron').dialog;
class Leads extends Model { }
Leads.init({
  companyName: DataTypes.STRING,
  contactNo: DataTypes.NUMBER,
  email: DataTypes.STRING,
  fileName: DataTypes.STRING
}, { sequelize, modelName: 'leads' });



if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir);
}
process.setMaxListeners(Infinity);
try {
  require('electron-reloader')(module)
} catch (_) { }
function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  // and load the index.html of the app.
  mainWindow.loadFile('index.html')

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  await sequelize.sync();
  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})
let stop = false
ipcMain.on('stop', async (event) => {
  stop = true
})
ipcMain.on('scrape', async (event, arg) => {
  stop = false
  let replies = []
  while (Number(arg.fromPage) <= Number(arg.toPage)) {
    if (stop) {
      break
    }
    try {
      let reply = null
      event.reply('pagenum', arg.fromPage)
      if (arg.tab === 'yellow-pages')
        reply = await scrapeYellowPages(arg)

      arg.fromPage = Number(arg.fromPage) + 1

      if (reply == null)
        break
      else
        replies.push(reply)
    } catch (error) {
      event.reply('page-reply', error)
    }
  }
  try {
    let workbook = new Excel.Workbook()
    let worksheet = workbook.addWorksheet(arg.name)

    if (arg.tab === 'yellow-pages') {
      worksheet.columns = [
        { header: 'Company Name', key: 'companyName' },
        { header: 'Contact Number', key: 'contactNo' },
        { header: 'Company Email', key: 'email' },
      ]
    }

    worksheet.columns.forEach(column => {
      column.width = 50
    })



    worksheet.getRow(1).font = { bold: true }

    let leads = [];

    if (arg.tab === 'yellow-pages') {
      replies.forEach((r, i) => {
        r.companyNames.forEach((companyName, index) => {
          let lead = {
            companyName: companyName,
            contactNo: r.contactNos[index],
            email: r.emails[index]
          }
          leads.push(lead);
        })
      })

      leads.forEach(l => {
        leads.push({
          companyName: l.companyName + "addon",
          contactNo: l.contactNo,
          email: l.email
        })
      })

      leads = leads.filter((v, i, self) => {
        return self.findIndex(me => {
          let isCompanyNameMatched = me.companyName === v.companyName;
          let isContactNoMatched = false
          let isEmailMatched = false;
          if (me.contactNo !== 'N/A')
            isContactNoMatched = me.contactNo === v.contactNo;
          if (me.email !== 'N/A')
            isEmailMatched = me.email === v.email;
          return (isCompanyNameMatched || isContactNoMatched || isEmailMatched)
        }) === i
      })


      await Promise.all(leads.map(async (lead, index) => {



        let res = await Leads.findAll({
          where: Sequelize.or({ 'companyName': lead.companyName },
            lead.contactNo === 'N/A' ? null : { 'contactNo': lead.contactNo },
            lead.email === 'N/A' ? null : { 'email': lead.email })
        })

        if (res === undefined || res.length == 0) {
          worksheet.addRow({ companyName: lead.companyName, contactNo: lead.contactNo, email: lead.email });
        }
      }));

    }
    await workbook.xlsx.writeFile(home + '/leads/' + arg.name + "-" + arg.location + ".xlsx");
  } catch (error) {
    console.log(error)
    event.reply('scrape-reply', error)
  }


  event.reply('scrape-reply', 'Done')
})

const resolution = {
  x: 1920,
  y: 1080,
}

const args = [
  '--disable-gpu',
  `--window-size=${resolution.x},${resolution.y}`,
  '--no-sandbox',
]



function getChromiumExecPath() {
  return puppeteer.executablePath().replace('app.asar', 'app.asar.unpacked');
}

async function scrapeYellowPages(arg) {
  const browser = await puppeteer.launch({ executablePath: getChromiumExecPath(), headless: true, defaultViewport: null, args: args })
  const pages = await browser.pages()
  const page = pages[0]
  await page.setViewport({ width: resolution.x, height: resolution.y });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36');
  await page.goto(`https://www.yellowpages.com.au/search/compare?clue=${arg.name}&locationClue=${arg.location}&pageNumber=${arg.fromPage}&referredBy=www.yellowpages.com.au&eventType=pagination`);
  const data = await page.$$eval('.inner-table.content', tables => {

    let table = tables[0]
    let trs = table.querySelectorAll('tr');
    let companyNames = []
    let contactNos = []
    let emails = []

    if (table.innerHTML.length < 1)
      return null

    for (i = 0; i < trs.length; ++i) {
      if (i >= 4)
        break
      else if (i == 0)
        continue
      else {
        if (i == 1) {
          trs[i].querySelectorAll('td').forEach(td => {
            if (td.getAttribute('class') === 'last-column-cell') { }
            else
              companyNames.push(td.innerText)
          })
        } else if (i == 2) {
          trs[i].querySelectorAll('td').forEach(td => {
            if (td.getAttribute('class') === 'last-column-cell') { }
            else {
              if (td.innerText.includes('Website')) {
                contactNos.push('N/A')
              } else
                contactNos.push(td.innerText)
            }

          })

        } else if (i == 3) {
          trs[i].querySelectorAll('td').forEach(td => {
            if (td.getAttribute('class') === 'last-column-cell') { }
            else {
              if (td.innerText.includes('Send Email')) {
                let a = td.querySelector('a')
                let email = a.getAttribute('data-email')
                emails.push(email)
              } else
                emails.push('N/A')
            }
          })

        }
      }

    }

    let data = {
      companyNames: companyNames,
      emails: emails,
      contactNos: contactNos
    }

    return data;
  })
  await browser.close();
  return data
}

ipcMain.on('showDialog', async (event, arg) => {
  dialog.showOpenDialog({ properties: ['openFile', 'openDirectory', 'multiSelections'], filters: [{ name: 'CSV', extensions: ['csv'] }] }).then(async res => {
    await uploadFiles(res.filePaths, event);
    event.reply('upload-reply', 'Done')
  });

})

async function uploadFiles(filenames, event) {

  filenames.forEach(async f => {
    try {
      let workbook = new Excel.Workbook();
      await workbook.csv.readFile(f);
      const worksheet = workbook.getWorksheet(1);
      worksheet.eachRow(async (row, rowNumber) => {
        if (rowNumber === 1) {
          //do nothing
        } else {
          let fileName = f.substring(f.lastIndexOf("/") + 1, f.length)
          let lead = Leads.build({ companyName: row.values[1], contactNo: row.values[3], email: row.values[4], fileName: fileName });
          await lead.save();
        }

      })
    } catch (error) {
      event.reply('upload-reply', error)
    }


  })


}