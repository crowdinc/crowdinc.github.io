/*window.onbeforeunload = function() {
  return "";
};*/

var DEBUG = false;
var soundEnabled = false;
var state = "STANDBY"; // STANDBY, GOLIVE, END
var STOPWORKING = false;
var arrayUUIDs = [];
var arrayUniqueNicknames = [];
var arrayUsers = [];
var arrayWaitingPeople = [];
var indexMostLiked = -1;
var likesMostLiked = 0;
var indexMostFollowed = -1;
var followersMostFollowed = 0;
var borderMostLiked = 50;
var borderMostFollowed = 40;
var divUsers = null;

var divTemplate = '<div id="[index]" class="modalDialog">\n         <div class = "center">\n          [nickname]<br>\n        </div>\n        <div class = "section group stats"> \n          <div class="col span_2_of_4_ center">\n            <img src="./images/heart_small.png" height="15px" style="float: left;">\n            <span style="float: left;" id=[index]_liked> 0</span>\n          </div>\n          <div class="col span_2_of_4_ center">\n            <img src="./images/crowd_small.png" height="15px"  style="float: left;">\n            <span id=[index]_crowd> 0</span>\n          </div>\n        </div>\n      </div>';

var pubnub = new PubNub({
  subscribeKey: subscribeKey,
  publishKey: publishKey,
  uuid: PubNub.generateUUID(),
  ssl: (('https:' == document.location.protocol) ? true : false)
});

pubnub.addListener({
  message: function(m) {
    parseMessage(m.message);
  },
  presence: function(p) {
    //console.log(p);
    performanceStatus(p);
  }
});

pubnub.subscribe({
  channels: ['performer', 'audience'],
  withPresence: true,
  heartbeat: 15
});

$(document).ready(function() {
  divUsers = $('#users');
  $('#broadcast').click(function(event) {
    if ($('#chat').val() == 'question') {
      publishMessage('audience', {
        type: 'question',
        text: $('#chat_message').val()
      });
      event.preventDefault();
    }
    else {
      publishMessage('audience', {
        type: 'script',
        script: "showMessage('" + $("#chat").val() + "','" + 
                            $('#chat_message').val() + "', true, 2000)"
      });
      event.preventDefault();
    }
  });
  $('#standby').click(function() {
    console.log('standby');
    state = "STANDBY";
    soundEnabled = false;
    respondState();
  });
  $('#golive').click(function() {
    console.log('golive');
    state = "GOLIVE";
    soundEnabled = true;
    respondState();
    publishMessage('log', {
      type: 'golive',
      user: 'Performer',
      timestamp: Math.floor(Date.now()),
      info: 'N/A'
    });
  });
  $('#refresh').click(function() {
    // refreshes all users' pages
    console.log('refresh');
    publishMessage("audience", {type:"script", script:"refresh()"});
    window.location.reload();
    publishMessage('log', {
      type: 'refresh',
      user: 'Performer',
      timestamp: Math.floor(Date.now()),
      info: 'N/A'
    });
  });
  $('#end').click(function() {
    console.log('end');
    state = "END";
    soundEnabled = false;
    respondState();
    publishMessage('log', {
      type: 'end',
      user: 'Performer',
      timestamp: Math.floor(Date.now()),
      info: 'N/A'
    });
  });
  var myTextArea = $('#code');
  var editor = CodeMirror.fromTextArea(document.getElementById('code'), {
    lineNumbers: false,
    styleActiveLine: true,
    matchBrackets: true
  });
  $('#resizable').resizable();
  $('#resizable').draggable();
  var livecode = function(cm) {
    var selectedText = cm.getDoc().getSelection();
    if (selectedText.length > 0) {
      console.log(selectedText);
      publishMessage('audience', {
        type: 'script',
        script: selectedText
      });
    }
    else {
      selectedText = cm.getDoc().getLine(cm.getDoc().getCursor().line);
      console.log(selectedText);
      publishMessage('audience', {
        type: 'script',
        script: selectedText
      });
    }
  };
  var map = {"Shift-Enter": livecode};
  editor.addKeyMap(map);
  
  // checks if another performer is present
  publishMessage('performer', {
    type: 'amialone',
    uuid: pubnub.getUUID()
  });
});

// handler for message events
function parseMessage(m) {
  if (STOPWORKING) return;
  try {
    if (DEBUG) console.log("message received: " + JSON.stringify(m));
    if (typeof m.type !== 'undefined') {
      if (typeof m.index !== 'undefined') {
        if (arrayUsers[m.index] == 'undefined') {
          return; // there's nothing we can do. (?)
        }
      }
      switch(m.type) {
        case 'create':
          create(m.my_id, m.nickname);
          break;
        case 'update':
          update(m.index, m.tm);
          break;
        case 'next':
          next(m.index);
          break;
        case 'whereami':
          // gives user position in queue
          inform(m.index)
          break;
        case 'unfollow':
          unfollow(m.index);
          break;
        case 'state':
          respondState(m.my_id);
          break;
        case 'mingle':
          console.log('mingle received');
          publishMessage(arrayUUIDs[m.index], {
            type: 'mingle-request',
            index: m.index,
            nickname: m.nickname
          });
          break;
        case 'liked':
          liked(m.index, m.likedindex);
          break;
        case 'amialone':
          if (pubnub.getUUID() != m.uuid) {
            publishMessage('performer', {
              type: 'youarenotalone',
              uuid: m.uuid
            });
          }
          break;
        case 'youarenotalone':
          if (pubnub.getUUID() == m.uuid) {
            alert('Someone\'s already performing!');
            STOPWORKING = true;
          }
          break;
        default:
          console.log('unhandled message type: ', m.type);
      }
    }
  }
  catch(err) {
    console.log(err.message);
  }
}

// handler for presence events
function performanceStatus(message) {
  if (DEBUG) console.log("status: " + JSON.stringify(event));
  // change backgroud of a disconnected user
  if (typeof message.action !== 'undefined') {
    if (message.action == 'timeout') {
      var user_disconected = arrayUUIDs.indexOf(message.uuid);
      if (user_disconected != -1) {
        var divDisconnected = document.getElementById(user_disconected);
        divDisconnected.style.background = "grey";
      }
    }
  }
}

function respondState(userID){
  if (userID)
    publishMessage(userID, {type:"state-response", sound:soundEnabled, state:state});
  else
    publishMessage("audience", {type:"state-response", sound:soundEnabled, state:state});
}

// central message sending function
function publishMessage(channel, options){
  if (STOPWORKING) {
    alert("Can't publish when another performer is active");
    return;
  }
  pubnub.publish({
    channel: channel,
    message: options
  });
  if (DEBUG) console.log("sent a message to channel (" + channel + ") : " + 
                         JSON.stringify(options));
}

function getRandomInt (min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function create(userID, userNickname) {
  // if the nickname doesn't exist yet
  if (arrayUniqueNicknames.indexOf(userNickname) == -1) {
    
    var index = arrayUniqueNicknames.push(userNickname) - 1;
    arrayUUIDs.push(userID);
    var user = {
      id: userID,
      nickname: userNickname,
      index: index,
      pattern: "",
      mode: "editing",
      follow: "",
      followers: [],
      likes: [],
      likedby: []
    };
    arrayUsers.push(user);
    publishMessage(userID, {
      type: "create-response",
      res: "s",
      index: index
    });
    displayUser(index);
    publishMessage('log', {
      type: 'create',
      user: userNickname,
      timestamp: Math.floor(Date.now()),
      info: 'N/A'
    });
  }
  
  // if the nickname already exists
  else {
    // duplicate nickname
    if (arrayUUIDs.indexOf(userID) == -1) {
      publishMessage(userID, {type: "create-response", res: "f"});
      console.log("nickname conflict!");
    }
    // disconnected user returning with same name
    else {
      var foundIndex = -1;
      for (var i = 0; i < arrayUsers.length; i++) {
        // find user's index in array
        if (userID.trim() === arrayUsers[i].id && 
            userNickname === arrayUsers[i].nickname) {
          foundIndex = i;
          // initiate user's interface
          publishMessage(userID, {
            type: "create-response",
            res: "s",
            index: foundIndex,
            pattern: arrayUsers[foundIndex].pattern
          });
          var user = arrayUsers[foundIndex];
          user.obj.remove();
          console.log("user exists and returned");
          publishMessage('log', {
            type: 'return',
            user: userNickname,
            timestamp: Math.floor(Date.now()),
            info: 'N/A'
          });
          break;
        }
      }
      if (foundIndex == -1) {
        publishMessage(userID, {"type": "create-response", "res": "f"});
        console.log("nickname conflict! (although s/he is an existing user)");
      }
      displayUser(foundIndex);
    }
  }
}

function displayUser(index) {
  var user = arrayUsers[index];
  var divStr = divTemplate.replace(/\[index\]/g,user.index).replace(/\[nickname\]/g,user.nickname);
  var newDiv = $('<div/>').html(divStr).contents();
  newDiv.find('.stats').css("display", "none");
  user.obj = newDiv;
  user.obj.find('.stats').css("display", "");
  $('#users').append(user.obj);
  if (arrayWaitingPeople.length > 0) {
    for (var i = 0; i < arrayWaitingPeople.length; i++) {
      next(arrayWaitingPeople[i]);
    }
    arrayWaitingPeople = [];
  }
}
//TODO: browse function for initial following
function update(userIndex, userPattern) {
  var user = arrayUsers[userIndex];
  if (!user) return;
  user.obj.css("background", "");
  
  user.pattern = userPattern;
  
  user.mode = "following";
  
  // if user is following someone
  /*if (user.follow !== "") { 
    var followed = arrayUsers[user.follow];
    if (arrayUsers.indexOf(followed) == -1) {
      next(user.index);
    }
    else {
      var suggested = followed;
      publishMessage(user.id, {
        "type": 'next-response',
        "suggested_tm": {
          "nickname": suggested.nickname,
          "index": suggested.index,
          "tm": suggested.pattern
        }
      });
    }
  }
  else {
    next(user.index);
  }*/
}

// user at userIndex unfollows whoever they are following
function unfollow(userIndex) {
  var user = arrayUsers[userIndex];
  var exFollowed = arrayUsers[user.follow];
  var followerIndex = exFollowed.followers.indexOf(user.index);
  exFollowed.followers.splice(followerIndex, 1);
  if (exFollowed.index == indexMostFollowed) {
    followersMostFollowed = followersMostFollowed - 1;
  }
  updateDiv(user.follow);
}

// unfollows the current followed user and follows the next in line
function next(userIndex) {
  var user = arrayUsers[userIndex];
  user.obj.css("background", "");
  var suggestedIndex = get_next_user_to_follow(userIndex);
  var previousFollow = '';
  var newFollow = arrayUsers[userIndex].nickname;
  
  // if user is following someone
  if (user.follow !== '') {
    previousFollow = arrayUsers[user.follow].nickname;
    unfollow(userIndex);
  }
  else previousFollow = 'N/A';
  
  if (suggestedIndex != -1) {
    var suggested = arrayUsers[suggestedIndex];
    
    // follow
    user.follow = suggestedIndex;
    suggested.followers.push(user.index);
    
    updateDiv(suggestedIndex);
    
    if (suggested.followers.length > followersMostFollowed) {
      indexMostFollowed = suggested.index;
      followersMostFollowed = suggested.followers.length;
      $('#most-followed').text(suggested.nickname);
    }
    
    // sends next pattern to user
    publishMessage(user.id, {
      "type": 'next-response',
      "suggested_tm": {
        "nickname": suggested.nickname,
        "index": suggested.index,
        "tm": suggested.pattern
      }
    });
    newFollow = suggested.nickname;
  }
  // no user to follow
  else {
    arrayWaitingPeople.push(user.index);
  }
  publishMessage('log', {
    type: 'next',
    user: arrayUsers[userIndex].nickname,
    timestamp: Math.floor(Date.now()),
    info: {
      previousFollow: previousFollow,
      newFollow: newFollow
    }
  });
}

function getRandomInt (min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function get_next_user_to_follow(userIndex) {
  var user = arrayUsers[userIndex];
  
  // if user is already following someone
  if (user.follow !== "") {
    suggestedIndex = (user.follow + 1) % arrayUsers.length;
    if (suggestedIndex == userIndex) {
      suggestedIndex = (suggestedIndex + 1) % arrayUsers.length;
    }
  }
  
  // initial assignment of follow - chooses a random user
  else {
    var suggestedIndex = getRandomInt(0, arrayUsers.length - 1);
  }
  
  if (suggestedIndex == userIndex) {
    console.log('nobody else to follow!');
    suggestedIndex = userIndex;
    var suggested = arrayUsers[suggestedIndex];
    publishMessage(arrayUsers[userIndex].id, {
      type: 'next-response',
      'suggested_tm': {
        'nickname': suggested.nickname,
        'index': suggested.index,
        'tm': suggested.pattern
      }
    });
  }
  return suggestedIndex;
}

// tells user where they are in queue - gets next user to follow
function inform(userIndex) {
  var user = arrayUsers[userIndex];
  if (!user) return;
  
  if (user.follow !== "") {
    var followed = user.follow;
    if (arrayUsers.indexOf(followed) == -1) {
      next(user.index);
      console.log('arrayUsers -1: was following user that left');
    }
    else {
      var suggested = arrayUsers[followed];
      publishMessage(arrayusers[userIndex].id, {
        "type": 'next-response',
        'suggested_tm': {
          'nickname': suggested.nickname,
          'index': suggested.index,
          'tm': suggested.pattern
        }
      });
      console.log('followed -1: was following user that left (?)');
    }
  }
  else {
    next(user.index);
  }
}

function updateDiv(index) {
  user = arrayUsers[index];
  user.obj.find('#'+index+'_liked').text(user.likedby.length);
  user.obj.find('#'+index+'_crowd').text(user.followers.length);
}

function liked(likerIndex, likedIndex) {
  // likerUser hearts likedUser's tune
  var likedUser = arrayUsers[likedIndex];
  var likerUser = arrayUsers[likerIndex];
  if (!likedUser || !likerUser) return;
  likerUser.obj.css('background', '');
  
  // liked hasn't been hearted by this user yet
  if (likedUser.likedby.indexOf(likerIndex) == -1) {
    likedUser.likedby.push(likerIndex);
    // notify liked user
    publishMessage(likedUser.id, {
      type: 'liked-response',
      nickname: likerUser.nickname,
      index: likerUser.index
    });
  }
  
  // if liker hasn't hearted liked's tune in the past
  if (likerUser.likes.indexOf(likedIndex) == -1) {
    likerUser.likes.push(likedIndex);
    // it's a match!
    if (likedUser.likes.indexOf(likerIndex) != -1 && likerIndex != likedIndex) {
      publishMessage(likerUser.id, {
        type: 'liked-response',
        nickname: likedUser.nickname,
        index: likedUser.index
      });
    }
  }
  
  // update most liked if necessary
  if (likedUser.likedby.length > likesMostLiked) {
    indexMostLiked = likedUser.index;
    likesMostLiked = user.likedby.length;
    $('#most-liked').text(likedUser.nickname);
  }
  updateDiv(likedIndex);
}


















