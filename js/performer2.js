/*window.onbeforeunload = function() {
  return "";
};*/

var DEBUG = true;
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

pubnub.subscribe({
  channels: ['performer', 'audience'],
  withPresence: true,
  heartbeat: 15
});

pubnub.addListener({
  message: function(m) {
    parseMessage(m.message);
  },
  presence: function(p) {
    performanceStatus(p);
  }
});

$(document).ready(function() {
  divUsers = $('#availables');
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
  });
  $('#refresh').click(function() {
    console.log('refresh');
    publishMessage("audience", {type:"script", script:"refresh()"});
    window.location.reload();
  });
  $('#end').click(function() {
    console.log('end');
    state = "END";
    soundEnabled = false;
    respondState();
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
});

// handler for message events
function parseMessage(m) {
  if (STOPWORKING) return;
  try {
    //if (DEBUG) console.log("message received: " + JSON.stringify(m));
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
        case 'editing':
          console.log('user ', m.nickname, ' is editing');
          break;
        case 'whereami':
          console.log('user ', m.nickname, ' sent a whereami message');
          inform(m.index)
          break;
        case 'state':
          respondState(m.my_id);
          break;
        case 'liked':
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
function performanceStatus(event) {
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
    alert("you can't publish a message");
    return;
  }
  pubnub.publish({
    channel: channel,
    message: options
  });
  pubnub.publish({
    channel: "log",
    message: "{" + channel + ":" + JSON.stringify(options) + "}"
  });
  if (DEBUG) console.log("sent a message to channel (" + channel + ") : " + 
                         JSON.stringify(options));
}

function create(userID, userNickname) {
  // if the nickname doesn't exist yet
  if (arrayUniqueNicknames.indexOf(userNickname) == -1) {
    // push returns the length
    var index = arrayUniqueNicknames.push(userNickname) - 1;
    arrayUUIDs.push(userID);
    var user = {
      'id': userID,
      'nickname': userNickname,
      'index': index,
      'pattern': "",
      'mode': "editing",
      'follow': "",
      'followers': [],
      'likes': [],
      'likedby': []
    };
    arrayUsers.push(user);
    publishMessage(userID, {
      'type': "create-response",
      'res': "s",
      'index': index
    });
  }
  // if the nickname already exists
  else {
    // duplicate nickname
    if (arrayUUIDs.indexOf(userID) == -1) {
      publishMessage(userID, {"type": "create-response", "res": "f"});
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
            "type": "create-response",
            "res": "s",
            "index": foundIndex
          });
          var user = arrayUsers[foundIndex];
          user.obj.remove();
          console.log("user exists and returned");
          break;
        }
      }
      if (foundIndex == -1) {
        publishMessage(userID, {"type": "create-response", "res": "f"});
        console.log("nickname conflict! (although s/he is an existing user)");
      }
    }
  }
  displayUser(index);
}

function displayUser(index) {
  var user = arrayUsers[index];
  var divStr = divTemplate.replace(/\[index\]/g,user.index).replace(/\[nickname\]/g,user.nickname);
  var newDiv = $('<div/>').html(divStr).contents();
  newDiv.find('.stats').css("display", "none");
  user.obj = newDiv;
  user.obj.find('.stats').css("display", "");
  divUsers.append(user.obj);
  if (arrayWaitingPeople.length > 0) {
    for (var i = 0; i < arrayWaitingPeople.length; i++) {
      next(arrayWaitingPeople[i]);
    }
    arrayWaitingPeople = [];
  }
}

function update(userIndex, userPattern) {
  var user = arrayUsers[userIndex];
  if (!user) return;
  user.obj.css("background", "");
  
  user.pattern = userPattern;
  
  user.mode = "following";
  
  // if user is following someone
  if (typeof(user.follow) == 'number') { 
    var followed = user.follow;
    if (arrayUsers.indexOf(followed) == -1) {
      next(user.index);
    }
    else {
      var suggested = arrayUsers[followed];
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
  }
}

// unfollows the current followed user and follows the next in line
function next(userIndex) {
  var user = arrayUsers[userIndex];
  user.obj.css("background", "");
  var suggestedIndex = get_next_user_to_follow(userIndex);
  // if user is following someone
  if (typeof(user.follow) == 'number') {
    var exFollowed = arrayUsers[user.follow];
    
    // unfollow
    var followerIndex = exFollowed.followers.indexOf[user.index];
    if (followerIndex != -1) {
      exFollowed.followers.splice(followerIndex, 1);
    }
    
    if (exFollowed.index == indexMostFollowed) {
      followersMostFollowed = followersMostFollowed - 1;
    }
    updateDiv(user.follow);
  }
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
  }
  // no user to follow
  else {
    arrayWaitingPeople.push(user.index);
  }
}

function get_next_user_to_follow(userIndex) {
  var user = arrayUsers[userIndex];
  
  // if user is already following someone
  if (typeof(user.follow) == 'number') {
    suggestedIndex = user.follow + 1;
  }
  else {
    var suggestedIndex = userIndex + 1;
  }
  
  if (suggestedIndex >= arrayUsers.length) {
    suggestedIndex = 0;
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
  
  if (typeof(user.follow) == 'number') {
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

function liked(user_index, liked_index) {
  
}


















