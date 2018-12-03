// possible issue - performer interface doesn't record when users enter 'WAIT' state, could accidentally allow requests to busy users to go through?

window.onbeforeunload = function() {
  //return '';
  /*publishMessage('log', {
    type: 'total refresh',
    user: 'performer'
  });*/
  return "are you sure?";
};

var DEBUG = false;
var soundEnabled = false;
var state = 'STANDBY'; // STANDBY, GOLIVE, END
var STOPWORKING = false;
var arrayUUIDs = [];
var arrayUniqueNicknames = [];
var arrayUsers = [];
var indexMostLiked = -1;
var likesMostLiked = 0;
var indexMostFollowed = -1;
var followersMostFollowed = 0;
var borderMostLiked = 50;
var borderMostFollowed = 40;
var divUsers = null;
var epoch;

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

  var broadcast = function() {
    var newChatVal = $('#chat_message').val().replace(/'/g, "\\'")
    $('#chat_message').val("");
    if ($('#chat').val() == 'question') {
      publishMessage('audience', {
        type: 'question',
        text: newChatVal
      });
      event.preventDefault();
    }
    else {
      publishMessage('audience', {
        type: 'script',
        script: "showMessage('" + $("#chat").val() + "','" +
          newChatVal + "', true, 3000)"
      });
      event.preventDefault();
    }
    publishMessage('log', {
      type: $('#chat').val(),
      user: 'performer',
      timestamp: Math.floor(Date.now()),
      data1: '"' + $('#chat_message').val().replace(/"/g, '""') + '"'
    });
  };
  $('#chat_message').keypress(function(e){
    if ((e.which && e.which == 13) || (e.keyCode && e.keyCode == 13))
      broadcast();
  })
  $('#broadcast').click(broadcast);
  $('#standby').click(function() {
    console.log('standby');
    state = 'STANDBY';
    soundEnabled = false;
    respondState();
    publishMessage('log', {
      type: 'standby',
      user: 'performer',
      timestamp: Math.floor(Date.now())
    });
  });
  $('#golive').click(function() {
    state = 'GOLIVE';
    soundEnabled = true;
    respondState();
    publishMessage('log', {
      type: 'golive',
      user: 'performer',
      timestamp: Math.floor(Date.now())
    });
  });
  $('#refresh').click(function() {
    // refreshes all users' pages
    console.log('refresh');
    publishMessage('audience', {
      type: 'script',
      script: 'refresh()'
    });
    publishMessage('log', {
      type: 'refresh',
      user: 'performer',
      timestamp: Math.floor(Date.now())
    });
  });
  $('#end').click(function() {
    console.log('end');
    state = 'END';
    soundEnabled = false;
    respondState();
    publishMessage('log', {
      type: 'end',
      user: 'performer',
      timestamp: Math.floor(Date.now())
    });
  });
  var myTextArea = $('#code');
  var editor = CodeMirror.fromTextArea(document.getElementById('code'), {
    lineNumbers: false,
    styleActiveLine: true,
    matchBrackets: true,
    mode:{name: "javascript", json: true}
  });
  $('#resizable').resizable();
  $('#resizable').draggable();
  var livecode = function(cm) {
    var doc = cm.getDoc();
    var selectedText = doc.getSelection();
    if (selectedText.length > 0) {
      console.log(selectedText);
      publishMessage('audience', {
        type: 'script',
        script: selectedText
      });

      _.defer(function(){
        var start = doc.getCursor("anchor");
        var end = doc.getCursor("head");
        if(start.line > end.line || (start.line == end.line && start.ch > end.ch)){
          var temp = start;
          start = end;
          end = temp;
        }
        var obj = doc.markText(start,end,{className:"ex-high"});
        setTimeout(function(){
          _.defer(function(){
            obj.clear();
          });
        },300);
      });


    }
    else {
      selectedText = doc.getLine(cm.getDoc().getCursor().line);
      console.log(selectedText);
      publishMessage('audience', {
        type: 'script',
        script: selectedText
      });

      try {
           _.defer(function(){
             var start = doc.getCursor();
             var obj = doc.markText({line:start.line, ch:0},{line:start.line, ch:selectedText.length},{className:"ex-high"});
             setTimeout(function(){
               _.defer(function(){
                 obj.clear();
               });
             },300);
           });
       } catch (e) {
           alert(e.message);
           console.error(e);
       }
    }
    publishMessage('log', {
      type: 'codeSnippet',
      user: 'performer',
      timestamp: Math.floor(Date.now()),
      data1: '"' + selectedText + '"'
    });
  };
  var map = {'Shift-Enter': livecode};
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
    if (DEBUG) console.log('message received: ' + JSON.stringify(m));
    if (typeof m.type !== 'undefined') {
      if (typeof m.index !== 'undefined') {
        if (arrayUsers[m.index] == 'undefined') {
          return; // there's nothing we can do. (?)
        }
      }
      switch(m.type) {
        case 'sendEpoch':
          publishMessage('log', {
            type: 'epoch',
            epoch: epoch
          })
          break;
        case 'create':
          create(m.id, m.nickname);
          break;
        case 'update':
          update(m.index, m.pattern);
          break;
        case 'prev':
          followNew(m.index, 'prev');
          break;
        case 'next':
          arrayUsers[m.index].state = 'BROWSE';
          followNew(m.index, 'next');
          break;
        case 'whereami':
          arrayUsers[m.index].state = 'BROWSE';
          // gives user position in queue. called when exiting mingle mode
          inform(m.index)
          break;
        case 'unfollow':
          unfollow(m.index);
          break;
        case 'state':
          respondState(m.id);
          break;
        case 'viewAll':
          var users = {};
          for (index in arrayUsers) {
            users[index] = arrayUsers[index].nickname;
          }
          publishMessage(arrayUsers[m.index].id, {
            type: 'viewAllResponse',
            users: users
          });
          break;
        case 'followUser':
          var userToFollow = arrayUsers[m.followIndex];
          publishMessage(arrayUsers[m.index].id, {
            type: 'newFollowResponse',
            suggestedUser: {
              index: m.followIndex,
              id: userToFollow.id,
              nickname: userToFollow.nickname,
              pattern: userToFollow.pattern,
              state: userToFollow.state
            }
          });
          break;
        case 'mingle':
          console.log('mingle received');
          var targetUser = arrayUsers[m.followIndex];
          if (targetUser.state == 'MINGLE') {
            publishMessage(arrayUsers[m.index].id, {
              type: 'userBusy',
              nickname: targetUser.nickname
            });
          }
          else {
            publishMessage(targetUser.id, {
              type: 'mingleRequest',
              index: m.index,
              nickname: arrayUsers[m.index].nickname,
              id: arrayUsers[m.index].id
            });
          }
          break;
        case 'mingleYes':
          // tells both the sender and receiver of the mingle request to enter mingle mode
          var sender = arrayUsers[m.sender];
          var receiver = arrayUsers[m.index];
          sender.state = 'MINGLE';
          receiver.state = 'MINGLE';

          publishMessage(sender.id, {
            type: 'beginMingle',
            role: 'sender',
            index: m.index,
            id: receiver.id,
            nickname: receiver.nickname,
            pattern: receiver.pattern,
            state: receiver.state
          });
          publishMessage(receiver.id, {
            type: 'beginMingle',
            role: 'receiver',
            index: m.sender,
            id: sender.id,
            nickname: sender.nickname,
            pattern: sender.pattern,
            state: sender.state
          });
          break;
        case 'mingleNo':
          publishMessage(arrayUsers[m.sender].id, {
            type: 'noMingle'
          });
          break;
        case 'exitMingle':
          publishMessage(m.idElse, {
            type: 'stopMingle'
          });
          break;

        case 'cancelRequest':
          publishMessage(arrayUsers[m.targetIndex].id, {
            type: 'cancelRequest',
            index: m.index,
            nickname: arrayUsers[m.index].nickname
          });
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
  if (message.action == 'join' && message.channel == 'performer') {
    epoch = Math.floor(Date.now());
    publishMessage('log', {
      type: 'join',
      user: 'performer',
      timestamp: epoch,
      data1: pubnub.getUUID()
    });
  };
  if (DEBUG) console.log('status: ' + JSON.stringify(event));
  // change backgroud of a disconnected user
  if (typeof message.action !== 'undefined') {
    if (message.action == 'timeout') {
      var user_disconected = arrayUUIDs.indexOf(message.uuid);
      if (user_disconected != -1) {
        var divDisconnected = document.getElementById(user_disconected);
        divDisconnected.style.background = 'grey';
      }
    }
  }
}

function respondState(userID){
  if (userID) {
    publishMessage(userID, {
      type: 'state-response',
      sound: soundEnabled,
      state: state
    });
  }
  else {
    publishMessage('audience', {
      type: 'state-response',
      sound: soundEnabled,
      state: state
    });
  }
}

// central message sending function
function publishMessage(channel, options){
  if (STOPWORKING) {
    alert('Can\'t publish when another performer is active');
    return;
  }
  pubnub.publish({
    channel: channel,
    message: options
  });
  if (DEBUG) console.log('sent a message to channel (' + channel + ') : ' +
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
      pattern: '',
      state: 'EDIT',
      follow: '',
      followers: [],
      likes: [],
      likedby: [],
    };
    arrayUsers.push(user);
    publishMessage(userID, {
      type: 'create-response',
      res: 's',
      index: index
    });
    displayUser(index);
    publishMessage('log', {
      type: 'create',
      user: userNickname,
      timestamp: Math.floor(Date.now())
    });
  }

  // if the nickname already exists
  else {
    // duplicate nickname
    if (arrayUUIDs.indexOf(userID) == -1) {
      publishMessage(userID, {
        type: 'create-response',
        res: 'f'
      });
      console.log('nickname conflict!');
    }
    // disconnected user returning with same name
    else {
      var foundIndex = -1;
      for (var i = 0; i < arrayUsers.length; i++) {
        // find user's index in array
        if (userID.trim() === arrayUsers[i].id &&
            userNickname === arrayUsers[i].nickname) {
          foundIndex = i;
          var user = arrayUsers[foundIndex];
          // initiate user's interface
          publishMessage(userID, {
            type: 'create-response',
            res: 's',
            index: foundIndex,
            likes: user.likes,
            pattern: user.pattern
          });

          user.state = 'EDIT';
          user.obj.remove();
          console.log('user exists and returned');
          publishMessage('log', {
            type: 'return',
            user: userNickname,
            timestamp: Math.floor(Date.now())
          });
          break;
        }
      }
      if (foundIndex == -1) {
        publishMessage(userID, {
          type: 'create-response',
          res: 'f'
        });
        console.log('nickname conflict! (although s/he is an existing user)');
      }
      displayUser(foundIndex);
    }
  }
}

function displayUser(index) {
  var user = arrayUsers[index];
  var divStr = divTemplate.replace(/\[index\]/g,user.index).replace(/\[nickname\]/g,user.nickname);
  var newDiv = $('<div/>').html(divStr).contents();
  newDiv.find('.stats').css('display', 'none');
  user.obj = newDiv;
  user.obj.find('.stats').css('display', '');
  $('#users').append(user.obj);
}

function update(userIndex, userPattern) {
  var user = arrayUsers[userIndex];
  if (!user) return;
  user.obj.css('background', '');
  user.pattern = userPattern;
}

function getUserToFollow(userIndex, direction) {
  var user = arrayUsers[userIndex];
  var suggestedIndex = -1;

  // initial assignment of follow - chooses a random user
  if (user.follow === '') {
    suggestedIndex = getRandomInt(0, arrayUsers.length - 1);
    if (suggestedIndex == userIndex) {
      // wraps around if end of queue is reached, via %
      suggestedIndex = (suggestedIndex + 1) % arrayUsers.length;
    }
  }
  else {
    if (direction == 'next') {
      suggestedIndex = (user.follow + 1) % arrayUsers.length;
      if (suggestedIndex == userIndex) {
        suggestedIndex = (suggestedIndex + 1) % arrayUsers.length;
      }
    }
    else if (direction == 'prev') {
      suggestedIndex = (user.follow - 1);
      // wraps around if beginning of queue is reached
      if (suggestedIndex < 0) suggestedIndex = arrayUsers.length - 1;
      if (suggestedIndex == userIndex) {
        suggestedIndex--;
        if (suggestedIndex < 0) suggestedIndex = arrayUsers.length - 1;
      }
    }
  }

  if (suggestedIndex == userIndex) {
    console.log('nobody else to follow!');
    publishMessage(arrayUsers[userIndex].id, {
      type: 'newFollowResponse',
      direction: direction,
      suggestedUser: {
        nickname: user.nickname,
        id: user.id,
        index: user.index,
        pattern: user.pattern,
        state: user.state
      }
    });
  }
  return suggestedIndex;
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

// unfollows the current followed user and follows the next/previous in line
function followNew(userIndex, direction) {
  var user = arrayUsers[userIndex];
  user.obj.css('background', '');
  var suggestedIndex = getUserToFollow(userIndex, direction);
  var previousFollow = '';
  // defaults to following self
  var newFollow = user.nickname;;

  // if user is following someone
  if (user.follow !== '') {
    previousFollow = arrayUsers[user.follow].nickname;
    unfollow(userIndex);
  }
  else previousFollow = 'N/A';

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

  // sends new pattern to user
  publishMessage(user.id, {
    type: 'newFollowResponse',
    direction: direction,
    suggestedUser: {
      nickname: suggested.nickname,
      id: suggested.id,
      index: suggested.index,
      pattern: suggested.pattern,
      state: suggested.state
    }
  });
  newFollow = suggested.nickname;

  publishMessage('log', {
    type: 'newFollow',
    user: arrayUsers[userIndex].nickname,
    timestamp: Math.floor(Date.now()),
    data1: direction,
    data2: previousFollow,
    data3: newFollow
  });
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// tells user where they are in queue - gets next user to follow
function inform(userIndex) {
  var user = arrayUsers[userIndex];
  if (!user) return;

  if (user.follow !== '') {
    var followed = user.follow;
    if (arrayUsers.indexOf(followed) == -1) {
      followNew(user.index, 'next');
      console.log('arrayUsers -1: was following user that left');
    }
    else {
      var suggested = arrayUsers[followed];
      publishMessage(arrayusers[userIndex].id, {
        type: 'newFollowResponse',
        direction: 'next',
        suggestedUser: {
          nickname: suggested.nickname,
          id: suggested.id,
          index: suggested.index,
          pattern: suggested.pattern,
          state: suggested.state
        }
      });
      console.log('followed -1: was following user that left (?)');
    }
  }
  else {
    followNew(user.index, 'next');
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
      type: 'likedResponse',
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
        type: 'likedResponse',
        nickname: likedUser.nickname,
        index: likedUser.index
      });
      publishMessage('log', {
        type: 'match',
        user: likerUser.nickname,
        timestamp: Math.floor(Date.now()),
        data1: likerUser.nickname,
        data2: likedUser.nickname
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
  publishMessage('log', {
    type: 'like',
    user: likerUser.nickname,
    timestamp: Math.floor(Date.now()),
    data1: likedUser.nickname
  });
}
