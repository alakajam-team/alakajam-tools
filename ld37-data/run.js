const ROOT = '../../alakajam/'

const config = require(ROOT + 'config.js')
const db = require(ROOT + 'core/db.js')
const models = require(ROOT + 'core/models.js')
const userService = require(ROOT + 'services/user-service.js')
const eventService = require(ROOT + 'services/event-service.js')
const fs = require('fs')

run()

async function run () {
  try {
    let data = JSON.parse(fs.readFileSync('out-ludum-dare-37.json').toString())
    let entryCount = Object.keys(data).length
    
    await db.initDatabase(false)
    
    let event = eventService.createEvent()
    event.set({
      title: 'Ludum Dare 37',
      name: 'ludum-dare-37',
      status: 'closed',
      display_dates: 'Novembary 17 - 20, 2016',
      display_theme: 'Make a website',
      status_theme: 'disabled',
      status_entry: 'on',
      status_results: 'disabled'
    })
    await event.save()
    
    let i = 1
  
    for (let entryId in data) {
      let entryData = data[entryId]
      
      if (entryData.AUTHOR_USERNAME) {
        let user = new models.User({
          email: 'example@example.com',
          name: entryData.AUTHOR_USERNAME,
          title: entryData.AUTHOR
        })
        userService.setPassword(user, entryData.AUTHOR_USERNAME)
        await user.save()
      
        let entry = await eventService.createEntry(user, event)
        entry.set('title', entryData.NAME)
        entry.save()
        let entryDetails = entry.related('details')
        entryDetails.set('body', entryData.DESCRIPTION)
        entryDetails.save()
      }
      
      console.log(i++ + '/' + entryCount + '...')
    }
  } catch (e) {
    log.error(e)
  }
  
  process.exit(0)
}