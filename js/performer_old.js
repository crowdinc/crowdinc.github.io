// main code
window.onbeforeunload = function(){
  return "";
};
function getRandomInt (min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

var DEBUG = false;

var indexMostLiked = -1;
var likesMostLiked = 0;
var indexMostFollowed = -1;
var followersMostFollowed = 0;
var borderMostLiked = 50;
var borderMostFollowed = 40;

var soundEnabled = false;
var state = "STANDBY"; // STANDBY, GOLIVE, END
var arrayUUIDs = new Array();

var arrayUniqueNicknames = new Array();
var arrayTinderMusics = new Array();
var arrayAvailables = new Array();
var arrayUnavailables = new Array();
var arrayWaitingPeople = new Array();
var divUnavailables = null;
var divAvailables = null;
var randomNumber ;
var STOPWORKING = false;

// load some variables after loading the page
function load() {
  divAvailables = $("#availables");
  divUnavailables = $("#unavailables");

  soundEnabled = false;
  $( "#radio" ).buttonset();
  $( "#chat" ).selectmenu({width: "auto"});

  $('#chat_message').button().addClass('my-textfield');
  $( "#broadcast" )
        .button()
        .click(function( event ) {
          if($("#chat").val() == "question"){
            publishMessage("audience", {type:"question", text:$('#chat_message').val()});
            event.preventDefault();
          }
          else{
            publishMessage("audience", {type:"script", script:"showMessage('"+$("#chat").val()+"','"+$('#chat_message').val()+"', true, 2000)"});
            event.preventDefault();
          }

        });
  $("#radio1").click(function(){
    state = "STANDBY";
    soundEnabled = false;
    respondState();
  });
  $("#radio2").click(function(){
    state = "GOLIVE";
    soundEnabled = true;
    respondState();
  });
  $("#radio3").click(function(){
    publishMessage("audience", {type:"script", script:"refresh()"});
    window.location.reload();

  });
  $("#radio4").click(function(){
    state = "END";
    soundEnabled = false;
    respondState();
  });
  randomNumber = getRandomInt(0,1000);
  publishMessage("performer", {type:"amialone", random:randomNumber});
}

// get/create/store UUID
var my_id = PUBNUB.db.get('session') || (function(){
    var uuid = PUBNUB.uuid();
    PUBNUB.db.set('session', uuid);
    return uuid;
})();

// initialize with Publish & Subscribe Keys
var pubnub = PUBNUB.init({
    publish_key: publishKey,
    subscribe_key: subscribeKey,
    uuid: my_id,
    ssl : (('https:' == document.location.protocol) ? true : false)
});

var divTemplate = '<div id="[index]" class="modalDialog">\n         <div class = "center">\n          [nickname]<br>\n        </div>\n        <div class = "section group stats"> \n          <div class="col span_2_of_4_ center">\n            <img src="./images/heart_small.png" height="15px" style="float: left;">\n            <span style="float: left;" id=[index]_liked> 0</span>\n          </div>\n          <div class="col span_2_of_4_ center">\n            <img src="./images/crowd_small.png" height="15px"  style="float: left;">\n            <span id=[index]_crowd> 0</span>\n          </div>\n        </div>\n      </div>';


// subscribe to a channel
pubnub.subscribe({

  // channel: 'snaglee_performer,audience',
  channel: 'performer,audience',
  presence: performanceStatus,
  message: parseMessage,
  error: function (error) {
   // Handle error here
   console.log("error:" + JSON.stringify(error));
   alert("subscribe error : " + JSON.stringify(error));
  },
  heartbeat: 15

});

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
    message: "{"+channel+":"+JSON.stringify(options)+"}"
  });

  if(DEBUG)console.log("sent a message to channel ("+channel+") : " + JSON.stringify(options));
}

// send the performance status
function performanceStatus( message ) {
  if(DEBUG)console.log("status: "+JSON.stringify(message));

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

// parse messages received from PubNub platform
function parseMessage( message ) {
  if (STOPWORKING) return;

  try {

    if(DEBUG)console.log("message - received:" + JSON.stringify(message));
    if (typeof message.type !== 'undefined') {
      if ( typeof message.index !== 'undefined'){
          if ( arrayTinderMusics[message.index] == 'undefined'){
            return; // there's nothing we can do.
          }
      }
      switch(message.type) {
        case 'create':
          create(message.my_id, message.nickname);
          break;
        case 'update':
          update(message.index, message.tm);
          break;
        case 'next':
          next(message.index);
          break;
        case 'editing':
          editing(message.index);
          break;
        case 'whereami':
          inform(message.index);
          break;
        case 'state':
          respondState(message.my_id);
          break;
        case 'liked':
          liked(message.index, message.likedindex); // keep track of likes for each individual.
          break;
        case 'amialone':
          if ( randomNumber != message.random){
            alert("someone started a performer's interface!");
            publishMessage("performer",{type:"youarenotalone", random:message.random} );
          }
        case 'youarenotalone':
          console.log("randomNumber:" + randomNumber + ", msg:" + message.random);
          if ( randomNumber == message.random){
            alert("There can be only one performer's interface running.");
            STOPWORKING = true;
          }
          break;

        default:
          break;
      }
    } else {
      console.log("unknown type of message received : " + JSON.stringify(message))
    }
  }
  catch(err) {
      console.log(err.message);
  }
}

// Controller

// create a user if possible
function create(user_id, user_nickname) {
  // if the nickname doesn't exist
  if ( arrayUniqueNicknames.indexOf(user_nickname) == -1 ) {
    var index = arrayUniqueNicknames.push(user_nickname) - 1; // push returns the length
    arrayUUIDs.push(user_id);
    var user = {
      'id' : user_id,
      'nickname' : user_nickname,
      'index' : index, // index at arrayUniqueNicknames will be the same in arrayTinderMusics (I hope!)
      'tm' : "", // tinder music
      'mode' : "editing", // modes: editing, following
      'status' : "unavailable", // status: unavailable, available
      'follow' : "",
      'followers' : [],
      'likes': new Array(),
      'likedby': new Array()
    };
    arrayTinderMusics.push(user);
    // add to view

    setAsUnavailable(index);
    publishMessage(user_id, {"type": "create-response",
                    "res": "s",
                    "index": index
          });
  // if the nickname already exists
  } else {
    if(arrayUUIDs.indexOf(user_id)!= -1 ){
      var foundIndex = -1;
      for (var i=0; i< arrayTinderMusics.length; i++){
        // someone refreshed the page and reconnect with same name
          if(user_id.trim()===arrayTinderMusics[i].id && user_nickname ===arrayTinderMusics[i].nickname){
            foundIndex = i;
            publishMessage(user_id, {"type": "create-response",
                            "res": "s",
                            "index": foundIndex
                  });
            var user = arrayTinderMusics[foundIndex];
            user.obj.remove();

            setAsUnavailable(foundIndex);
            console.log("user exists and returned");

            break;
          }
      }
      if(foundIndex==-1){
        publishMessage(user_id, {"type": "create-response","res": "f"});
        console.log("nickname conflict! (althouhg s/he is an exisitng user )");
      }
    }
    else{
      publishMessage(user_id, {"type": "create-response","res": "f"});
      console.log("nickname conflict!");
    }
  }
}
// updating the stats of each individual
function updateDiv(index){
  user = arrayTinderMusics[index];
  user.obj.find('#'+index+'_liked').text(user.likedby.length);
  user.obj.find('#'+index+'_crowd').text(user.followers.length);
}

function respondState(user_id){
  if (user_id)
    publishMessage(user_id, {type:"state-response", sound:soundEnabled, state:state});
  else
    publishMessage("audience", {type:"state-response", sound:soundEnabled, state:state});
}

function liked(user_index, liked_index){

  // A likes B's tune
  var user = arrayTinderMusics[liked_index]; // this is B
  var user2 = arrayTinderMusics[user_index]; // this is A
  if(!user)return;
  if(!user2)return;
  user2.obj.css("background", "");

  if ( user.likedby.indexOf(user_index) == -1){ //  if B was not liked by A so far
    user.likedby.push(user_index);
    // notify B that A likes you
    publishMessage(user.id, {"type" : "liked-response", "nickname": user2.nickname, "index":user2.index})
  }

  if ( user2.likes.indexOf(liked_index) == -1){ // if  A did not liked B in the past
    user2.likes.push(liked_index);
    if (user.likes.indexOf(user_index) != -1 && user_index != liked_index) // B has liked A, too!!
    {
      // notify A
      publishMessage(user2.id, {"type" : "liked-response", "nickname": user.nickname, "index":user.index})
    }
  }



  // update screen with the most liked
  if (user.likedby.length > likesMostLiked ) {
    indexMostLiked = user.index;
    likesMostLiked = user.likedby.length;
    $("#most-liked").text(user.nickname);
    console.log("most-liked person: id" + liked_index);
  }
  updateDiv(liked_index);

}

// update the tinder music and get the next user to follow (get the next?! always?!)
function inform(user_index){
  var user = arrayTinderMusics[user_index];
  if(!user)return;

  if ( typeof(user.follow) == 'number' ) { // I was in a pattern
    var followed = user.follow;

    if (arrayAvailables.indexOf(followed) == -1) {
        next(user.index)
        console.log("arrayAvailables -1 : I was following someone disappeared");
    }
    else {
      var suggested = arrayTinderMusics[followed];
      publishMessage(user.id,
        {"type": "next-response",
          "suggested_tm": {
                      "nickname" : suggested.nickname,
                      "index" : suggested.index,
                      "tm" : suggested.tm
                    }
                  });
      console.log("followed -1 : I was folloing someone disappeared");
    }
    // TODO: update the number of followers on the screen
  }
  else{
    next(user.index);
  }
}

function update(user_index, user_tm) {
  var user = arrayTinderMusics[user_index];
  if(!user)return;
  user.obj.css("background", "");

  // update the tinder music
  user.tm = user_tm;

  // set the user mode
  user.mode = "following";

  if (user.status == 'unavailable') {
    //document.getElementById(user.index).className = 'unavailable';
    var actualIndex = arrayUnavailables.indexOf(user_index);
      if (actualIndex != -1) {
        arrayUnavailables.splice(actualIndex,1);
      }
      setAsAvailable(user_index);
    //  div.remove();
      updateDiv(user_index)
  }

  if ( typeof(user.follow) == 'number' ) { // I was in a pattern
    var followed = user.follow;

    if (arrayAvailables.indexOf(followed) == -1) {
        next(user.index)
    }
    else {
      var suggested = arrayTinderMusics[followed];
      publishMessage(user.id,
        {"type": "next-response",
          "suggested_tm": {
                      "nickname" : suggested.nickname,
                       "index" : suggested.index,

                      "tm" : suggested.tm
                    }
                  });
    }
  }
  else{
    next(user.index);
  }
}

// update the next user to follow
function next(user_index) {
  var user = arrayTinderMusics[user_index];
  user.obj.css("background", "");

  suggested_index = get_next_user_to_follow(user_index);

  if ( typeof(user.follow) == 'number' ) {
    var ex_followed = arrayTinderMusics[user.follow];
    // unfollow the older
    var follower_index = ex_followed.followers.indexOf[user.index];
    if (follower_index != -1) {
      ex_followed.followers.splice(follower_index,1);
    }

    // TODO: update the number of followers on the screen

    if (ex_followed.index == indexMostFollowed) {
      followersMostFollowed = followersMostFollowed - 1;
    } 
    updateDiv(user.follow);
  }

  if ( suggested_index != -1 ) {
    var suggested = arrayTinderMusics[suggested_index];

    // follow
    user.follow = suggested_index;
    suggested.followers.push(user.index);

    updateDiv(suggested_index);

    // TODO: update the number of followers on the screen
    // if it is the most followed now
    if (suggested.followers.length > followersMostFollowed) {
      indexMostFollowed = suggested.index;
      followersMostFollowed = suggested.followers.length;
      $("#most-followed").text(suggested.nickname);
    } 
    // response
    publishMessage(user.id, {"type": "next-response",
                    "suggested_tm": {
                      "nickname" : suggested.nickname,
                      "index" : suggested.index,
                      "tm" : suggested.tm
                    }
                  });

  } else {
    // there is no user to follow
    // keep track of waiting people
    arrayWaitingPeople.push(user.index);
  }
}


// return the index of the next user to follow
// based on the index of the follower (not the index of the followed)
function get_next_user_to_follow(user_index) {
  var user = arrayTinderMusics[user_index];

  var suggested_index = -1;

  if ( arrayAvailables.length > 0 ) {
    suggested_index = arrayTinderMusics[ arrayAvailables[0] ].index;

    if ( typeof(user.follow) == 'number' ) {
      var ex_followed = user.follow;
      // search the next one
      if ( arrayTinderMusics[ex_followed].status == 'available') {
        var possible = arrayAvailables.indexOf(ex_followed) + 1;
        if (possible < arrayAvailables.length) {
          suggested_index = arrayTinderMusics[ arrayAvailables[possible] ].index;
        }
      } // else there is no one available, follow the first
    } // else the user is not following anybody, follow the first
  } // else there is no one to follow, return -1

  return suggested_index;
}


// when the user goes to edit mode
// the performer change the mode and color
// and inform to everybody
function editing(user_index) {
  var user = arrayTinderMusics[user_index];
  if(!user)return;
  var actualIndex = arrayAvailables.indexOf(user_index);
    if (actualIndex != -1) {
      arrayAvailables.splice(actualIndex,1);
    }
    else{
      if(DEBUG) console.log("something is wrong");
    }
    user.obj.remove();
    setAsUnavailable(user_index);
}


// View

// set the tinder music as unavailable
function setAsUnavailable(index) {
  var user = arrayTinderMusics[index];

  if ( user.status == 'available' ) {
    user.status = 'unavailable';
    for ( i = 0; i < user.followers.length; i++) {
    }
  } else if ( user.status == 'unavailable') {
    // run something if the user is new?!
  }
  var divStr = divTemplate.replace(/\[index\]/g,user.index).replace(/\[nickname\]/g,user.nickname)
  var newDiv = $('<div/>').html(divStr).contents();//document.createElement('div');
  newDiv.find('.stats').css("display", "none");
  //newDiv.id = index;
  if ( user.mode != 'editing') {
    newDiv.className = 'unavailable';
  } else {
    newDiv.className = 'unavailable-editing';
  }
  //newDiv.appendChild(document.createTextNode(user.nickname  ));
  // onclick set as available
/*  newDiv.onclick = function() {
    // the user can go to available mode only when it is playing, yeah?!
    if (arrayTinderMusics[index].mode != 'editing') {
      var actualIndex = arrayUnavailables.indexOf(index);
      if (actualIndex != -1) {
        arrayUnavailables.splice(actualIndex,1);
      }
    //  this.remove();
      setAsAvailable(index);
    }
  }
  */

  arrayUnavailables.push(index);
  divUnavailables.append(newDiv);
  user.obj = newDiv;
}

  // set the tinder music as available
function setAsAvailable(index) {
  var user = arrayTinderMusics[index];
  var obj = user.obj;
  user.status = 'available';

  if (user.mode != 'editing') {
    obj.className = 'available';
  } else {
    obj.className = 'available-editing';
  }
  obj.find('.stats').css("display", "");

  arrayAvailables.push(index);

  divAvailables.append(obj);

  if ( arrayWaitingPeople.length > 0){
    for(var i=0; i< arrayWaitingPeople.length; i++){
      next(arrayWaitingPeople[i]);
    }
    arrayWaitingPeople = new Array();
  }
}

$(document).ready(function () {
  var myTextArea = $("#code");
  var editor = CodeMirror.fromTextArea(document.getElementById("code"), {
      lineNumbers: false,
      styleActiveLine: true,
      matchBrackets: true
  });

  $( "#resizable" ).resizable();
  $( "#resizable" ).draggable();

  var livecode = function(cm){
    var selectedText = cm.getDoc().getSelection();
    if(selectedText.length > 0){
      console.log(selectedText);
      publishMessage("audience", {type:"script",script:selectedText});
    }else{
      selectedText = cm.getDoc().getLine(cm.getDoc().getCursor().line);
      console.log(selectedText);
      publishMessage("audience", {type:"script",script:selectedText});
    }
  };

  var map = {"Shift-Enter": livecode};
  editor.addKeyMap(map);



});
