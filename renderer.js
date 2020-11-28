function scrape() {
    return {
        tab: 'yellow-pages',
        location: '',
        name: '',
        fromPage: 1,
        toPage: 1,
        scrape() {
            let arg = {
                name: this.name,
                location: this.location,
                fromPage: this.fromPage,
                toPage: this.toPage,
                tab: this.tab
            }
            document
                .querySelector('#scrape').classList.add('cursor-not-allowed')
            document
                .querySelector('#loader').classList.remove('hidden')
            document
                .querySelector('#scrape').disabled = true
            window.ipcRenderer.send('scrape', arg)
        },
        showDialog() {
            window.ipcRenderer.send('showDialog')
        }
    }
}


document
    .querySelector('#stop')
    .addEventListener('click', () => {
        window.ipcRenderer.send('stop')
    })

ipcRenderer.on('scrape-reply', (event, arg) => {
    alert(arg)
    document
        .querySelector('#scrape').disabled = false
    document
        .querySelector('#scrape').classList.remove('cursor-not-allowed')
    document
        .querySelector('#loader').classList.add('hidden')
})

ipcRenderer.on('pagenum', (event, arg) => {
    document.querySelector('#pagenum').innerHTML = arg
})

ipcRenderer.on('page-reply', (event, arg) => {
    alert(arg)
})

ipcRenderer.on('upload-reply', (event, arg) => {
    alert(arg)
})