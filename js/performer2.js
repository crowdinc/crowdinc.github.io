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
    parseMessage(m);
  }
});

$(document).ready(function() {
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
    //window.location.reload();
  });
  $('#end').click(function() {
    console.log('end');
    state = "END";
    soundEnabled = false;
    respondState();
  });
});

function parseMessage(m) {
  if (STOPWORKING) return;
  console.log(m.message);
}

function respondState(user_id){
  if (user_id)
    publishMessage(user_id, {type:"state-response", sound:soundEnabled, state:state});
  else
    publishMessage("audience", {type:"state-response", sound:soundEnabled, state:state});
}

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
    var index = arrayUniqueNicknames.push(user_nickname) - 1;
    arrayUUIDs.push(user_id);
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
      publishMessage(user_id, {"type": "create-response", "res": "f"});
      console.log("nickname conflict!");
    }
    // disconnected user returning with same name
    else {
      var foundIndex = -1;
      for (var i = 0; i < arrayTinderMusics.length; i++){
        if (user_id.trim() === arrayTinderMusics[i].id && 
            user_nickname === arrayTinderMusics[i].nickname) {
          foundIndex = i;
          publishMessage(user_id, {
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
        publishMessage(user_id, {"type": "create-response", "res": "f"});
        console.log("nickname conflict! (although s/he is an existing user)");
      }
    }
  }
}