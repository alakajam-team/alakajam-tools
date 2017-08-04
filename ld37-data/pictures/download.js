const promisify = require('promisify-node')
const fs = promisify('fs')
const http = require('http')
const globalTunnel = require('global-tunnel');

// XXX Untested

/*process.env.http_proxy = ''
globalTunnel.initialize()*/

let download = promisify(downloadAsync)

run()

async function run () {
  try {
    let data = JSON.parse(fs.readFileSync('../out-ludum-dare-37.json').toString())
    let entryCount = Object.keys(data).length

    let i = 1
    for (let entryId in data) {
      let entry = data[entryId]
      let picturePath = entryId + '.jpg'
      
      let exists = false
      try {
        await fs.access(picturePath)
        exists = true
      } catch (e) {
        // Nothing
      }
      
      if (!exists && entry.SCREENSHOTS && entry.SCREENSHOTS.length > 0) {
        console.log('[' + i + ' of ' + entryCount + '] Downloading picture for "' + entry.NAME + '"...')
        console.log(entry.SCREENSHOTS[0].LOCATION)
       // await download(entry.SCREENSHOTS[0].LOCATION, picturePath)
      }
      i++
    }
  } catch (e) {
    console.error(e)
  }
}

function downloadAsync(url, path, cb) {
  console.log(url)
  let buffer = ''
  http.get(url, function (res) {
    res.on('data', data => buffer += data)
    res.on('end', () => {
      if (buffer && buffer[0] != '<') {
        fs.writeFileSync(path, buffer)
        cb(null, buffer)
      } else {
        cb('failed :(')
      }
    })
  })
}
