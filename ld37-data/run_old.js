const ROOT = '../../alakajam/'

const config = require(ROOT + 'config.js')
const db = require(ROOT + 'core/db.js')
const models = require(ROOT + 'core/models.js')
const userService = require(ROOT + 'services/user-service.js')
const eventService = require(ROOT + 'services/event-service.js')
const postService = require(ROOT + 'services/post-service.js')
const fs = require('fs')
const log = require(ROOT + 'core/log')

const loremIpsum = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
const loremIpsumSize = loremIpsum.length
run()

async function run () {
  try {
    let data = JSON.parse(fs.readFileSync('ld37-min.json').toString())
    let entryCount = Object.keys(data).length
    
    let previousEventId = null;
    await eventService.findEventByName('ludum-dare-37').then(function (result) {
      if(result != null){
        console.log("Deleted event: "+ result.attributes['id']);
        previousEventId = result.attributes['id'];
        result.destroy()
      }
    })
    
    let deletedUserCount = 0
    if(previousEventId != null){
      await models.User.query(function (qb) {
        qb.innerJoin('user_role', 'user_role.user_id', 'user.id');
        qb.where('user_role.event_id', '=', previousEventId);
      }).fetchAll().then(function (resData) {
        resData.models.forEach(function(user) {
          console.log(user.attributes['name'])
          user.destroy()
		  deletedUserCount++
        })
      })
    }
    console.log(deletedUserCount + ' users deleted')
	
    
    let newVersion = await db.initDatabase(false)
    console.log('DB reset done (current version : ' + newVersion + ').')
    
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
    
    let usersMap ={};
    let usersEntryMap ={};
    let i = 1
    console.log("Create games and users")
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
        usersMap[entryData.AUTHOR_USERNAME] = user
      
        // Clean description
        entryData.DESCRIPTION = entryData.DESCRIPTION.replace(/<br><\/br>/gi, "\r\n");
        let entry = await eventService.createEntry(user, event)
        entry.set('title', entryData.NAME)
        entry.set('description', cutDescription(entryData.DESCRIPTION))
        entry.set('links', formatLinks(entryData.PLATFORMS))
        
        await entry.save()
        usersEntryMap[entryData.AUTHOR_USERNAME] = entry
        
        let entryDetails = entry.related('details')
        entryDetails.set('body', entryData.DESCRIPTION)
        await entryDetails.save()
      }
      
      console.log(i++ + '/' + entryCount + '...')
    }
    
    console.log("Create comments + feedbackScore")
    i = 1
    for (let entryId in data) {
      let entryData = data[entryId]
      let entry = usersEntryMap[entryData.AUTHOR_USERNAME]
      
      for(let index in entryData.COMMENTS){
        let commentData = entryData.COMMENTS[index]
        let commentUser = usersMap[commentData.SCREEN_NAME]
        if(commentUser){
          console.log("Comment for user " + commentData.SCREEN_NAME) 
          let comment = null
          comment = await postService.createComment(commentUser, entry)
          comment.set('body', fakeContent(commentData.CONTENT_LENGTH))
          await comment.save()
          await eventService.refreshCommentScore(comment)
          await comment.save()
          await eventService.refreshEntryScore(usersEntryMap[commentData.SCREEN_NAME])
        }
      }
      
      await eventService.refreshEntryScore(entry)
      await postService.refreshCommentCount(entry)
      
      console.log(i++ + '/' + entryCount + '...')
    }
  } catch (e) {
    console.log(e);
    log.error(e)
  }
  
  process.exit(0)
}

function cutDescription(text){
  return text.substring(0, text.indexOf("\r\n"))
}

function formatLinks(links){
  let result = []
  links.forEach(function(link) {
    result.push({
      "label" : link.TEXT,
      "url": link.LOCATION.replace(/\\/gi, "")
    })
  })
  return result
}



function fakeContent(size){
  let result
  if(size > loremIpsumSize){
    result = loremIpsum + "\r\n\r\n" + fakeContent(size - loremIpsumSize)
  } else {
    result = loremIpsum.substring(0,size)
  }
  return result
}