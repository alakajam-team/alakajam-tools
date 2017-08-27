const ROOT = '../../alakajam/'

const config = require(ROOT + 'config.js')
const db = require(ROOT + 'core/db.js')
const models = require(ROOT + 'core/models.js')
const userService = require(ROOT + 'services/user-service.js')
const eventService = require(ROOT + 'services/event-service.js')
const postService = require(ROOT + 'services/post-service.js')
const fs = require('fs')
const log = require(ROOT + 'core/log')
const slug = require('slug')


const loremIpsum = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
const loremIpsumSize = loremIpsum.length
run()

async function run () {
  try {
    // let data = JSON.parse(fs.readFileSync('ld37-min.json').toString())
    let data = JSON.parse(fs.readFileSync('out-ludum-dare-37.json').toString())
    
    let previousEventId = null;
    await models.Event.where('name', 'ludum-dare-38').fetch({})
      .then(function (result) {
        if(result != null){
          console.log("Deleted event: "+ result.attributes['id']);
          previousEventId = result.attributes['id'];
        }
      })
    
    // Clean database
    if(previousEventId){
      await db.knex('user_role')
        .where('event_id', previousEventId)
        .del()
      console.log("User roles deleted")
      
      await db.knex('entry')
        .where('event_id', previousEventId)
        .del()
      console.log("Entries deleted")
      
      await db.knex('event')
        .where('id', previousEventId)
        .del()
      console.log("Event deleted")
      
      await db.knex('comment')
      .whereIn('id', function() {
        this.select('comment.id').from('comment').leftJoin('entry', function() {
          this.on('comment.node_id', '=', 'entry.id')
        }).where('node_type', '=', 'entry').whereNull('entry.id')
      }).del()
      console.log("Comments deleted")
      
      let beforeUserCount = await db.knex('user').count('* as nb')
      await db.knex('user')
        .where('created_at', '=', 1500000000000)
        .del()
      let afterUserCount = await db.knex('user').count('* as nb')
      console.log((beforeUserCount[0].nb - afterUserCount[0].nb) + ' users deleted')
    }
    
    let newVersion = await db.initDatabase(false)
    console.log('DB reset done (current version : ' + newVersion + ').')
    
    let event = eventService.createEvent()
    event.set({
      title: 'Ludum Dare 38',
      name: 'ludum-dare-38',
      status: 'closed',
      display_dates: 'June 17 - 20, 2017',
      display_theme: 'Make a website',
      status_theme: 'disabled',
      status_entry: 'on',
      status_results: 'disabled'
    })
    await event.save()
    

    var users = await createUsers(data)
    var entries = await createEntries(data, event, users)
    var entriesDetails = await createEntriesDetails(data, entries)
    var userRoles = await createEntriesUserRole(data, event, users, entries)
    var comments = await createComments(data, event, users, entries)
    
    await updateEntriesScore(entries)
    
  } catch (e) {
    console.log(e);
    log.error(e)
  }
  
  process.exit(0)
}

async function createUsers(data){
  console.log("Create games and users")
  let entryCount = Object.keys(data).length
  let i = 1
  let users = []
  let user = new models.User({})
  for (let entryId in data) {
    let entryData = data[entryId]
    
    if (entryData.AUTHOR_USERNAME) {
      if(entryData.AUTHOR_USERNAME.length < 6){
        userService.setPassword(user, entryData.AUTHOR_USERNAME + entryData.AUTHOR_USERNAME)
      } else {
        userService.setPassword(user, entryData.AUTHOR_USERNAME)
      }

      users.push({
        email: 'example@example.com',
        name: entryData.AUTHOR_USERNAME,
        title: entryData.AUTHOR,
        password: user.get('password'),
        password_salt: user.get('password_salt'),
        created_at: 1500000000000,
        updated_at: 1500000000000
      })
    } else{
        users.push({
        email: 'example@example.com',
        name: entryData.AUTHOR,
        title: entryData.AUTHOR,
        password: user.get('password'),
        password_salt: user.get('password_salt'),
        created_at: 1500000000000,
        updated_at: 1500000000000
      })
    }
  }

  var chunkSize = 100;
  await db.knex.transaction(function(tr) {
    return db.knex.batchInsert('user', users, chunkSize)
      .transacting(tr)
    })
    .then(function(lastInsertId) { 
      if(Array.isArray(lastInsertId)){
        lastInsertId = lastInsertId[lastInsertId.length - 1]
      }
      
      let currentId = lastInsertId - users.length + 1
      users.forEach(function(row){
        row.id = currentId
        currentId++
      })
      console.log(users.length + " users created")
    })
    .catch(function(error) {
      console.log("error: " + error)
    })
   return users
}

async function createEntries(data, event, users){
  var entries = [];
  let index = 0;
  for (let entryId in data) {
    let entryData = data[entryId]
    let user = users[index]
      
    // Clean description
    if(entryData.DESCRIPTION){
      entryData.DESCRIPTION = entryData.DESCRIPTION.replace(/<br><\/br>/gi, "\r\n");
    } else {
      entryData.DESCRIPTION = ""
    }
      
    if(!entryData.NAME){
      entryData.NAME = "Deleted Entry " + index
    }
      
    let entry = {
      'event_id': event.get('id'),
      'event_name': event.get('name'),
      'title': entryData.NAME,
      'name': slug(entryData.NAME || '').toLowerCase(),
      'description': cutDescription(entryData.DESCRIPTION),
      'links': formatLinks(entryData.PLATFORMS),
      created_at: new Date(),
      updated_at: new Date()
    }
    entries.push(entry);
    index++
  }
   
  var chunkSize = 100;
  await db.knex.transaction(function(tr) {
    return db.knex.batchInsert('entry', entries, chunkSize)
      .transacting(tr)
    })
    .then(function(lastInsertId) {
      if(Array.isArray(lastInsertId)){
        lastInsertId = lastInsertId[lastInsertId.length - 1]
      }
      let currentId = lastInsertId - entries.length + 1
      entries.forEach(function(row){
        row.id = currentId
        currentId++
      })
      console.log(entries.length + " entries created")
    })
    .catch(function(error) {
      console.log("error: " + error)
    })
    
  return entries
}

async function createEntriesDetails(data, entries){
  var entriesDetails = []
  let index = 0;
  for (let entryId in data) {
    let entryData = data[entryId]
    let entry = entries[index]
      
    // Clean description
    entryData.DESCRIPTION = entryData.DESCRIPTION.replace(/<br><\/br>/gi, "\r\n");
    
    entriesDetails.push({
      'body': entryData.DESCRIPTION,
      'entry_id': entry.id
    })
    index++
  }
   
  var chunkSize = 100;
  await db.knex.transaction(function(tr) {
    return db.knex.batchInsert('entry_details', entriesDetails, chunkSize)
      .transacting(tr)
    })
    .then(function(lastInsertId) {
      if(Array.isArray(lastInsertId)){
        lastInsertId = lastInsertId[lastInsertId.length - 1]
      }
      let currentId = lastInsertId - entriesDetails.length + 1
      entriesDetails.forEach(function(row){
        row.id = currentId
        currentId++
      })
      console.log(entriesDetails.length + " entriesDetails created")
    })
    .catch(function(error) {
      console.log("error: " + error)
    })
  
  return entriesDetails
}


async function createEntriesUserRole(data, event, users, entries){
  var userRoles = []
  let index = 0;
  for (let entryId in data) {
    let entryData = data[entryId]
    let entry = entries[index]
    let user = users[index]

    // Clean description
    userRoles.push({
      'user_id': user.id,
      'user_name': user.name,
      'user_title': user.title,
      'node_id': entry.id,
      'node_type' : 'entry',
      'permission': 'manage',
      'created_at': new Date(),
      'updated_at': new Date(),
      'event_id' : event.get('id')
    })
    index++
  }
   
  var chunkSize = 100;
  await db.knex.transaction(function(tr) {
    return db.knex.batchInsert('user_role', userRoles, chunkSize)
      .transacting(tr)
    })
    .then(function(lastInsertId) {
      if(Array.isArray(lastInsertId)){
        lastInsertId = lastInsertId[lastInsertId.length - 1]
      }
      let currentId = lastInsertId - userRoles.length + 1
      userRoles.forEach(function(row){
        row.id = currentId
        currentId++
      })
      console.log(userRoles.length + " userRoles created")
    })
    .catch(function(error) {
      console.log("error: " + error)
    })
  
  return userRoles
}

async function createComments(data, event, users, entries){
  var comments = []
  let index = 0;
  
  let usersMap = [];
  
  for(let index in users){
    let user = users[index]
    usersMap[user.title] = user
  }

  let ignoreComment = 0
  for (let entryId in data) {
    let entryData = data[entryId]
    let entry = entries[index]
    let user = users[index]
    let userScore = []
    
    for(let index in entryData.COMMENTS){
      let commentData = entryData.COMMENTS[index]
      let commentUser = usersMap[commentData.SCREEN_NAME]
      if(commentUser){
        let adjustedScore = 0
        if(commentUser != user){
          if(!userScore[commentData.SCREEN_NAME]){
            userScore[commentData.SCREEN_NAME] = 0
          }
          adjustedScore = Math.max(0, Math.min(_computeRawCommentScore(commentData.CONTENT_LENGTH), 3 - userScore[commentData.SCREEN_NAME]))
        }
        userScore[commentData.SCREEN_NAME] = userScore[commentData.SCREEN_NAME] + adjustedScore
        comments.push({
          'node_id': entry.id,
          'node_type' : 'entry',
          'user_id': commentUser.id,
          'body': fakeContent(commentData.CONTENT_LENGTH),
          'created_at': new Date(),
          'updated_at': new Date(),
          'feedback_score' : adjustedScore
        })
      } else {
        ignoreComment++
      }
    }
    index++
  }
  console.log(ignoreComment + " comments ignore due to unknown user")
   
  var chunkSize = 100;
  await db.knex.transaction(function(tr) {
    return db.knex.batchInsert('comment', comments, chunkSize)
      .transacting(tr)
    })
    .then(function(lastInsertId) {
      if(Array.isArray(lastInsertId)){
        lastInsertId = lastInsertId[lastInsertId.length - 1]
      }
      let currentId = lastInsertId - comments.length + 1
      comments.forEach(function(row){
        row.id = currentId
        currentId++
      })
      console.log(comments.length + " comments created")
    })
    .catch(function(error) {
      console.log("error: " + error)
    })
  
  return comments
}

async function updateEntriesScore(entriesData){
  let promises = []
  let entries = []
  
  for(let index in entriesData){
    let entryId = entriesData[index].id
    let promise = models.Entry.where('id', entryId).fetch({ withRelated: ['details', 'event', 'userRoles','comments'] }).then(entry => { entries.push(entry) })
    promises.push(promise)
    if(parseInt(index) % 100 == 0){
      await Promise.all(promises)
      promises = []
    }
  }
  await Promise.all(promises)
  promises = []
  
  let chunkSize = 100
  for(let index in entries){
    let entry = entries[index]
    entry.set('comment_count', entry.comments.length)
    let promise = eventService.refreshEntryScore(entry)
    promises.push(promise)
    if((parseInt(index) + 1) % chunkSize == 0){
      console.log("Score calculation in progress...")
      var t = process.hrtime();
      await Promise.all(promises)
      t = process.hrtime(t);
      console.log("Score calculated "+ (parseInt(index) + 1) +"/"+entriesData.length+" entries")
      console.log("Time left: ~" + Math.trunc(((entries.length - parseInt(index)) / chunkSize) * (t[0] + (t[1] / 1000000000))) + " secondes")
      console.log("")
    }
  }
  await Promise.all(promises)
}


function cutDescription(text){
  return text.substring(0, text.indexOf("\r\n"))
}

function formatLinks(links){
  let result = []
  if(links){
    links.forEach(function(link) {
      result.push({
        "label" : link.TEXT,
        "url": link.LOCATION.replace(/\\/gi, "")
      })
    })
  }
  // console.log(JSON.stringify(result))
  return JSON.stringify(result)
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

function _computeRawCommentScore (commentLength) {
  if (commentLength > 300) { // Elaborate comments
    return 3
  } else if (commentLength > 100) { // Interesting comments
    return 2
  } else { // Short comments
    return 1
  }
}