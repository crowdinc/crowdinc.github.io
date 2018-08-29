var state = 'NAME'; // it is either NAME, EDIT, WAIT, BROWSE, MINGLE
var DEBUG = false;
var performerState = 'STANDBY';
/*

  State Diagram

  NAME -> EDIT : create-response msg received
  EDIT -> WAIT : 'next' msg sent
  WAIT -> BROWSE : newFollowResponse msg received in 'WAIT' state
  BROWSE -> MINGLE : user press HEART button
  MINGLE -> BROWSE : user press exit button
  BROWSE -> EDIT : user press 'update' button

  */

var NORESPONSE1 = true;
var NORESPONSE2 = true;
var NORESPONSE3 = 0;

var soundEnabled = true;
var context;
var compressor;
var reverb;
var w;
var h;
var noteSize;
var patternSize = 5;

// properties of the user's self
var myIndex;
var strScreenName;
var pattern = [];
var originalPattern = [];
var liked = [];

// properties of a followed user
var patternElse = [];
var nicknameElse = '';
var indexElse;
var idElse;
var stateElse;

// information about who this user has sent/received mingle requests to/from
var requestTo = -1;
var requestsFrom = [];
var currentRequestID = '';
var currentRequestNickname = '';

var myMessages = ['info', 'warning', 'error', 'success', 'like', 'mingleRequest'];

$(document).ready(function () {
  
  function hideAllMessages() {
    var messagesHeights = []; // this array will store height for each

    for (i = 0; i < myMessages.length; i++) {
      // fill array 
      messagesHeights[i] = $('.' + myMessages[i]).outerHeight(); 
      // move element outside viewport
      $('.'+myMessages[i]).animate({top:-messagesHeights[i]}, 500);
    }
  }

  function showMessage(type, message, autoHide, hideTime) {
    hideAllMessages();
    $('.' + type + ' .msg_header').text(message);
    $('.' + type).animate({top: '0'}, 500);
    if (autoHide) {
      hideTime = hideTime | 3000;
      setTimeout(hideAllMessages, hideTime);
    }
  }

  function BufferLoader(context, urlList, callback) {
    this.context = context;
    this.urlList = urlList;
    this.onload = callback;
    this.bufferList = [];
    this.loadCount = 0;
  }

  BufferLoader.prototype.loadBuffer = function(url, index) {
    // Load buffer asynchronously
    var request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';

    var loader = this;

    request.onload = function() {
      // Asynchronously decode the audio file data in request.response
      loader.context.decodeAudioData(
        request.response,
        function(buffer) {
          if (!buffer) {
            alert('error decoding file data: ' + url);
            return;
          }
          loader.bufferList[index] = buffer;
          if (++loader.loadCount == loader.urlList.length)
            loader.onload(loader.bufferList);
        },
        function(error) {
          console.error('decodeAudioData error', error);
        }
      );
    }
    request.send();
  };

  BufferLoader.prototype.load = function() {
    for (var i = 0; i < this.urlList.length; ++i) {
      this.loadBuffer(this.urlList[i], i);
    }
  };

  function loadSounds(obj, soundMap, callback) {
    // Array-ify
    var names = [];
    var paths = [];
    for (var name in soundMap) {
      var path = soundMap[name];
      names.push(name);
      paths.push(path);
    }
    var bufferLoader = new BufferLoader(context, paths, function(bufferList) {
      for (var i = 0; i < bufferList.length; i++) {
        var buffer = bufferList[i];
        var name = names[i];
        obj[name] = buffer;
      }
      if (callback) {
        callback();
      }
    });
    bufferLoader.load();
  }

  var buffers = {};
  var soundmap = {
      'ir1' : './sound/ir1.wav'
    , 'sus1' : './sound/sus_note.wav'
    , 'yes':'./sound/yes.mp3'
    , 'no': './sound/no.mp3'
    , 'liked': './sound/liked.wav'
    , 'matched': './sound/matched.mp3'
  };
  //, 'piano1': 'piano_note1_f_sharp.wav', 'indo1' : 'indonesian_gong.wav', 'june_o' : 'june_o.wav', 'reversegate' :'H3000-ReverseGate.mp3'};

  function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function noteNum2Freq(num) {
    return Math.pow(2, (num-57) / 12) * 440;
  }

  if (soundEnabled) {
    try {
      // still needed for Safari
      window.AudioContext = window.AudioContext || window.webkitAudioContext;
      // create an AudioContext
      context = new window.AudioContext();
      compressor = context.createDynamicsCompressor()
      reverb = context.createConvolver();
    } catch(e) {
      // API not supported
      alert('Web Audio API not supported, please use most recent Chrome (41+), FireFox(31+) or Safari (iOS 7.1+).');
    }
  }

  loadSounds(buffers, soundmap, function() {
    reverb.buffer = buffers['ir1'];
  });


  var playSample = function(sampleName, randomSpeed) {
    if (buffers[sampleName]) {
      var source = context.createBufferSource();
      source.buffer = buffers[sampleName];
      if (randomSpeed) {
        source.playbackRate.value = (Math.random() - 0.5) * 0.2 + 1;
      }
      source.connect(compressor);
      source.start(0);
    }
  }

  function ADSR() {
      this.node = context.createGain();
      this.node.gain.value = 0.0;
  }

  ADSR.prototype.noteOn = function(delay, A,D, peakLevel, sustainlevel) {
      peakLevel = peakLevel || 1;
      sustainlevel = sustainlevel || 0.3;

      this.node.gain.linearRampToValueAtTime(0.0, delay + context.currentTime);
      this.node.gain.linearRampToValueAtTime(peakLevel, delay + context.currentTime + A); // Attack
      this.node.gain.linearRampToValueAtTime(sustainlevel, delay + context.currentTime + A + D);// Decay
  }

  ADSR.prototype.noteOff = function(delay, R, sustainlevel) {
      sustainlevel = sustainlevel || 0.1;

      this.node.gain.linearRampToValueAtTime(sustainlevel, delay + context.currentTime );// Release
      this.node.gain.linearRampToValueAtTime(0.0, delay + context.currentTime + R);// Release
  }

  ADSR.prototype.play = function(delay, A,D,S,R, peakLevel, sustainlevel) {
    this.node.gain.linearRampToValueAtTime(0.0, delay + context.currentTime);
    this.node.gain.linearRampToValueAtTime(peakLevel, delay + context.currentTime + A); // Attack
    this.node.gain.linearRampToValueAtTime(sustainlevel, delay + context.currentTime + A + D);// Decay
    this.node.gain.linearRampToValueAtTime(sustainlevel, delay + context.currentTime + A + D + S);// sustain.
    this.node.gain.linearRampToValueAtTime(0.0, delay + context.currentTime + A + D + S + R);// Release
  }
  var index = 0;

  function ScissorVoice(noteNum, numOsc, oscType, detune) {
    this.output  = new ADSR();
    this.maxGain = 1 / numOsc;
    this.noteNum = noteNum;
    this.frequency = noteNum2Freq(noteNum);
    this.oscs = [];
    this.index = index++;
    this.time = context.currentTime;
    for (var i = 0; i < numOsc; i++) {
      var osc = context.createOscillator();
      if (oscType.length === 'undefined')
        osc.type = oscType;
      else
        osc.type = oscType[i % oscType.length];
      osc.frequency.value = this.frequency;
      osc.detune.value = -detune + i * 2 * detune / numOsc ;
      osc.start(context.currentTime);
      osc.connect(this.output.node);
      this.oscs.push(osc);
    }
  }

  ScissorVoice.prototype.stop = function(time) {
    var it = this;
    setTimeout(function() {
      for (var i = 0; i < it.oscs.length; i++) {
        it.oscs[i].disconnect();
      }
    }, Math.floor((time-context.currentTime)*1000));
  }

  ScissorVoice.prototype.detune = function(detune) {
    for (var i = 0; i < this.oscs.length; i++) {
      this.oscs[i].detune.value -= detune;
    }
  }

  ScissorVoice.prototype.connect = function(target) {
    this.output.node.connect(target);
  }

  window.requestAnimFrame = (function() {
    return  window.requestAnimationFrame ||
      window.webkitRequestAnimationFrame ||
      window.mozRequestAnimationFrame    ||
      window.oRequestAnimationFrame      ||
      window.msRequestAnimationFrame     ||
      function(callback) {
        window.setTimeout(callback, 1000 / 60);
      };
  })();

  var pentatonicScale = [0,2,4,7,9];
  var majorScale = [0,2,4,5,7,9,11,12];
  var scaleWeight = [2,1,2,1,2,1,1,2];
  var minorScale = [0,2,3,5,7,8,10,12];
  var selectedScale = majorScale;
  var selectedScaleWeight = scaleWeight;
  var baseNote = 60;

  function getPitchIndex(num) {
      var weightSum = 0;
      for (var i = 0; i < selectedScale.length; i++) {
        weightSum += selectedScaleWeight[i];
      }
      var count;
      var accWeight=0;
      for (count = 0; count < selectedScale.length; count++) {
        if (num <= accWeight / weightSum)
          break;
        accWeight += selectedScaleWeight[count];
      }
      return count - 1;
  }
  function Note() {
    this.x = 0;
    this.y = 0;
    this.distance = 0;
  }

  Note.prototype.setPosition = function(x, y) {
    this.x = parseFloat(x).toFixed(3);
    this.y = parseFloat(y).toFixed(3);
  }

  function dist(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
  }

  function drawCircle(ctx, x,y,r, color) {
      ctx.beginPath();
      ctx.fillStyle = color || '#000000';
      ctx.arc(x,y,r, 0, Math.PI * 2);
      ctx.fill();
  }

  function drawLine(ctx, x1,y1,x2,y2, color) {
      ctx.beginPath();
      ctx.moveTo(x1,y1);
      ctx.lineTo(x2,y2);
      ctx.lineWidth = 10;
      ctx.strokeStyle = color || '#00FF00';
      ctx.stroke();
  }

  // This segment displays the validation rule for address field.
  function textAlphanumeric(inputText) {
    var alphaExp = /^[0-9a-zA-Z._]+$/;
    if (inputText.match(alphaExp)) {
      return true;
    } else {
      return false;
    }
  }

  // shows browseable list of all active users
  function viewAll(users) {
    state = 'VIEWALL';
    $('#waiting-message').css('visibility', 'hidden');
    $('#viewTableContainer').css('visibility', 'visible');
    $('#notifyDot').css('visibility', 'hidden');

    $('#requestsBody').empty();
    $('#usersBody').empty();
    
    for (index in users) {
      // don't display yourself
      if (index == myIndex) {
        continue;
      }
      // pending request from this user
      else if (requestsFrom.includes(parseInt(index))) {
        addRequestRow(users[index], index);
      }
      // all other users
      else {
        addUserRow(users[index], index);
      }
    }
  }

  // adds a row to list of pending requests
  function addRequestRow(nickname, index) {
    var row = 
        '<tr>' + 
          '<td>' + 
            nickname + 
          '</td>' + 
          '<td colspan="2" class="text-right">' + 
            '<button id="accept' + index + 
            '" class="response accept btn btn-xl btn-success">' +
              'Accept' + 
            '</button>' +
            '<button id="ignore' + index + 
            '" class="response ignore btn btn-info">' +
              'Ignore' + 
            '</button>' +
          '</td>' +
          '<td class="text-right">' +
            '<button id="view' + index + 
            '" class="btn btn-primary shortcutButton view">' + 
              '<i class="fas fa-eye responsive_font_4"></i>' + 
            '</button> ' + 
          '</td>' + 
        '</tr>'
    $('#requestsBody').append(row);
  }
  
  // adds a row to list of other users
  function addUserRow(nickname, index) {
    var row = 
        '<tr>' + 
          '<td colspan="3">' + 
            nickname + 
          '</td>' + 
          '<td class="text-right">' + 
            '<button id="view' + index + 
            '" class="btn btn-primary shortcutButton view">' + 
              '<i class="fas fa-eye responsive_font_4"></i>' + 
            '</button> ' + 
          '</td>' + 
        '</tr>'
    $('#usersBody').append(row);
  }
  
  function removeRequestRow(nickname) {
    $('#requestsTable td').filter(function() { 
      return $(this).text() === nickname; 
    }).parent().remove();
  }
  
  function removeUserRow(nickname) {
    $('#usersTable td').filter(function() { 
      return $(this).text() === nickname; 
    }).parent().remove();
  }
  
  function browse(elseIndex, elseNickname, elsePattern, elseID, elseState) {
    NORESPONSE3--;
    patternElse = elsePattern;
    nicknameElse = elseNickname;
    indexElse = elseIndex;
    idElse = elseID;
    stateElse = elseState;
    $('#screenname_display').text(nicknameElse);

    for (var i = 0; i < patternElse.length - 1; i++) {
      patternElse[i].distance = dist(patternElse[i].x * w, patternElse[i].y * h, 
                                     patternElse[i+1].x * w, patternElse[i+1].y * h);
    }
    if (state == 'WAIT') {
      $('.bottom_banner2').css('visibility', 'hidden');
      $('#bottom_banner').css('visibility', 'visible');
      $('#top_banner').css('visibility', 'visible');
      lastPingTimeElse = Date.now();
      state = 'BROWSE';
      $('#waiting-message').css('visibility', 'hidden');
    }
    $('#viewTableContainer').css('visibility', 'hidden');
    $('#screenBlock').css('visibility', 'hidden');
    if (stateElse == 'MINGLE') $('#mingle').addClass('dimmed');
    else $('#mingle').removeClass('dimmed');
  }

  function getNewPattern(direction) {
    state = 'WAIT';
    NORESPONSE3++;

    for (var i = 0; i < patternElse.length - 1; i++) {
      patternElse[i].distance = dist(patternElse[i].x * w, patternElse[i].y * h, 
                                     patternElse[i+1].x * w, patternElse[i+1].y * h);
    }
    publishMessage('performer', {
      type: direction, 
      index: myIndex
    });

    $('#screenBlock').css('visibility', 'visible');
    $('#waiting-message').css('visibility', 'visible');
  }

  // Set the name of the next div
  /*function setNextDivName(divName) {
    var actualTindered =  document.getElementById('tindered');
    actualTindered.innerHTML = '';
    actualTindered.appendChild(document.createTextNode(divName));
  }*/

  window.onbeforeunload = function() {
    if (state != 'NAME') {
      publishMessage('performer', {
        type: 'unfollow',
        index: myIndex
      });
    }
    if (requestTo != -1) {
      publishMessage('performer', {
        type: 'cancelRequest',
        index: myIndex,
        targetIndex: requestTo
      });
    }
    if (requestsFrom.length) {
      for (i in requestsFrom) {
        publishMessage('performer', {
          type: 'mingleNo',
          sender: requestsFrom[i]
        });
      }
    }
    //return '';
  };

  function randomizeNote() {
    for (var i = 0; i < patternSize; i++) {
      var note = new Note();
      note.setPosition(Math.random(), Math.random());
      pattern[i] = note;
    }

    for (var i = 0; i < patternSize - 1; i++) {
      pattern[i].distance = dist(pattern[i].x * w, pattern[i].y * h, 
                                 pattern[i+1].x * w, pattern[i+1].y * h);
    }
  }

  function refresh() {
    //window.onbeforeunload = null;
    showMessage('info', 'This page will be refreshed in 3 seconds...', true, 2500);
    setTimeout(function() {
      window.location.reload();
    },3000);
  }

  function update() {
    state = 'WAIT';
    publishMessage('performer', {
      type: 'update', 
      index: myIndex, 
      pattern: pattern
    });
    $('#waiting-message').css('visibility', 'visible');
    $('#submit_pane').css('visibility', 'hidden');
  }

  function mingle() {
    state = 'MINGLE';
    $('#mingle_pane').css('visibility', 'visible');
    $('#like').css('visibility', 'visible');

    if (liked.indexOf(indexElse) == -1) $('#like').removeClass('red');
    else $('#like').addClass('red');

    $('#bottom_banner').css('visibility', 'hidden');
    $('#top_banner').css('visibility', 'hidden');
    for (var i = 0; i < pattern.length; i++) {
      var note = new Note();
      note.setPosition(pattern[i].x, pattern[i].y);
      note.distance = pattern[i].distance;
      originalPattern[i] = note;
    }
  }

  // get/create/store UUID
  var myID = PUBNUB.db.get('session') || (function() {
    var uuid = PUBNUB.uuid();
    PUBNUB.db.set('session', uuid);
    return uuid;
  })();

  // Initialize with Publish & Subscribe Keys
  var pubnub = PUBNUB.init({
    publish_key: publishKey,
    subscribe_key: subscribeKey,
    uuid: myID,
    ssl : (('https:' == document.location.protocol) ? true : false)
  });

  // Subscribe to a channel
  pubnub.subscribe({
    channel: myID + ',audience',
    message: parseMessage,
    presence: parsePresence,
    error: function (error) {
      // Handle error here
      console.log(JSON.stringify(error));
      refresh();
    },
    heartbeat: 15
  });
  
  function publishMessage(channel, options) {
    if (channel == 'audience') {
      console.error('please not hack this application. :) ');
      return;
    }
    pubnub.publish({
      channel: channel,
      message: options,
      error: function(m) {
        console.log('Message send failed - ['
                    + JSON.stringify(m) + '] - Retrying in 3 seconds!');
        setTimeout(publishMessage(channel, options), 2000);
      }
    });
    if (DEBUG) {
      console.log('sent a message to channel ('+channel+') : ' + JSON.stringify(options));
    }
  }
  
  var joinMessageSent = false;

  function parsePresence(p) {
    if (p.action == 'join' && !joinMessageSent) {
      console.log(p);
      publishMessage('log', {
        type: 'join',
        user: 'audience',
        timestamp: Math.floor(Date.now()),
        data1: myID
      });
      joinMessageSent = true;
    }
  }
  
  function parseMessage(m) {
    if (DEBUG) console.log('message - received:' + JSON.stringify(m));
    /*if (typeof m.nextDivName !== 'undefined') {
      setNextDivName(m.nextDivName);
    }*/
    else if (typeof m.type !== 'undefined') {
      switch(m.type) {
        case 'create-response':
          NORESPONSE1 = false;
          if (m.res == 's') {
            state = 'EDIT';
            $('#initial-message').bPopup().close();
            strScreenName = $('#screenname').val();
            $('#screenname_display').text(strScreenName);
            myIndex = m.index;
            lastPingTime = Date.now();
            $('#submit_pane').css('visibility', 'visible');
            if (m.pattern) {
              console.log('pattern exists');
              for (var i = 0; i < m.pattern.length; ++i) {
                pattern[i].setPosition(m.pattern[i].x, m.pattern[i].y);
              }
            }
            publishMessage('performer', {
              type: 'update',
              index: myIndex,
              pattern: pattern
            });
          }
          else {
            $('#name_error_msg').text($('#screenname').val() + ' is already taken.');
          }
          break;
        case 'newFollowResponse':
          setTimeout(browse, 500, m.suggestedUser.index, 
                     m.suggestedUser.nickname, m.suggestedUser.pattern, 
                     m.suggestedUser.id, m.suggestedUser.state);
          break;
        case 'viewAllResponse':
          viewAll(m.users);
          break;
        case 'queryState':
          // the user is trying to send a request
          publishMessage(m.id, {
            type: 'respondState',
            state: state
          });
          break;
        case 'respondState':
          // either display busy message or send a mingle request and display
          // pending request message
          stateElse = m.state;
          if (stateElse == 'MINGLE') {
            showMessage('error', nicknameElse + 
                        ' is already mingling, try again later!', true, 1000);
            $('#mingle').addClass('dimmed');
          }
          else {
            $('#mingle').removeClass('dimmed');
            requestTo = indexElse;
            publishMessage('performer', {
              type: 'mingle',
              index: myIndex,
              followIndex: indexElse
            });
            $('#mingle').addClass('clicked');
            $('#mingleIcon').css('opacity', '0.2');
            $('#mingleText').empty().append('pending request to ' + nicknameElse + 
                                   ' - press here to cancel');
          }
          break;
        case 'mingleRequest':
          if (state != 'VIEWALL') {
            showMessage('mingleRequest', 'mingle request from ' + m.nickname, 
                        true, 1500);
            if (state == 'EDIT' || state == 'VIEWALL') {
              $('#notifyDot').css('visibility', 'visible');
            }
          }
          // add this request to the list of pending requests
          addRequestRow(m.nickname, m.index);
          
          requestsFrom.push(m.index);
          currentRequestID = m.id;
          currentRequestNickname = m.nickname;
          
          // removes user from list of other users
          removeUserRow(m.nickname);
          break;
        case 'cancelRequest':
          if (state == 'VIEWALL') {
            // removes request from list of pending requests
            removeRequestRow(m.nickname);

            // adds user back to 'other users' section
            addUserRow(m.nickname, m.index);
          }
          else {
            $('#notifyDot').css('visibility', 'hidden');
            
            // hides mingle request header
            hideAllMessages();
          }
          
          // clears flag
          requestsFrom.splice(requestsFrom.indexOf(m.index), 1);
          break;
        case 'userBusy':
          if (nicknameElse == m.nickname && 
              !($('#mingle').hasClass('dimmed'))) {
            // dim mingle area, make sure there's no pending request
            // as the request was denied
            $('#mingle').addClass('dimmed');
            $('#mingleText').empty();
            $('#mingle').removeClass('clicked');
          }
          showMessage('error', m.nickname + 
                      ' is already mingling, try again later!', true, 1000);
          break;
        case 'beginMingle':
          if (m.role == 'sender') {
            requestTo = -1;
            showMessage('success',  
                        m.nickname + 
                        ' accepted your request! Entering mingle mode...', 
                        true, 1000);
          }
          // jump user to the target pattern
          setTimeout(browse, 2000, m.index, m.nickname, m.pattern, m.id, m.state);
          $('.bottom_banner2').css('visibility', 'hidden');
          $('#viewTableContainer').css('visibility', 'hidden');
          // begin mingle
          setTimeout(mingle, 2100);
          
          // reactivate the mingle button
          $('#mingle').removeClass('clicked');
          $('#mingleText').empty();
          $('#mingleIcon').css('opacity', '1');
          break;
        case 'mingleMove':
          patternElse = m.pattern;
          break;
        case 'stopMingle':
          showMessage('error',  
                      nicknameElse + 
                      ' ended the mingle session, exiting...', true, 1000);
          setTimeout(exit, 2000);
          break;
        case 'noMingle':
          // reactivate the mingle button
          $('#mingle').removeClass('clicked');
          $('#mingleText').empty();
          $('#mingleIcon').css('opacity', '1');
          break;
        case 'likedResponse': 
          if (m.index == myIndex) {
            showMessage('error',  'I know! You like your tune.', true, 1000);
          }
          else if (liked.indexOf(m.index) == -1) {
            showMessage('error',  m.nickname + ' likes your tune!', true, 1000);
            playSample('liked', true);
          }
          else {
            showMessage('error', 'It\'s a match! ' + m.nickname + 
                        ' likes your tune, too!', true, 1000);
            playSample('matched', true);
          }
          break;
        case 'question':
          if (m.text.length > 0) {
            $('#question_content').text(m.text);
            $('#question-message').css('visibility', 'visible');
          }
          break;
        case 'scale':
          if (m.probability >= 0) {
            if (m.probability > Math.random()) {
              baseNote = m.baseNote;
              selectedScale = m.scale;
            }
          }
          else {
            baseNote = m.baseNote;
            selectedScale = m.scale;
            showMessage('info', 'The performer changed the scale.', true);
          }
          break;
        case 'sound-toggle':
          if (m.probability >= 0) {
            if (m.probability > Math.random()) {
              soundEnabled = m.on;
            }
          }
          else {
            soundEnabled = m.on;
          }
          break;
        case 'script':
          if (m.script) {
            if (m.probability >= 0) {
              if (m.probability > Math.random()) {
                try {
                  eval(m.script);
                } catch (e) {
                  console.log(e);
                }
              }
            }
            else {
              try {
                eval(m.script);
              } catch (e) {
                console.log(e);
              }
            }
          }
          break;
        case 'state-response':
          NORESPONSE2 = false;
          soundEnabled = m.sound;
          performerState = m.state;
          if (performerState == 'STANDBY') {
            showMessage('warning', 'STANDBY, Crowd in C is about to start.');
            $('#STANDBY').css('visibility', 'visible');
            $('#STANDBY').css('z-index', '2');
          }
          else if (performerState == 'GOLIVE') {
            hideAllMessages();
            showMessage('success', 'Let\'s go live!', true);
            $('#STANDBY').css('visibility', 'hidden');
            $('#STANDBY').css('z-index', '0');
          }
          else if (performerState == 'END') {
            hideAllMessages();
            showMessage('success', 'This is the end. (Applause)', true);
            $('#STANDBY').css('visibility', 'hidden');
            $('#STANDBY').css('z-index', '0');
          }
          break;
        default:
          console.log('unhandled type received: ', m.type);
      }
    }
    else console.log('undefined type, message: ', JSON.stringify(m));
  }
  
  // Initially, hide them all
  hideAllMessages();

  // When message is clicked, hide it
  $('.message').click(function() {
    $(this).animate({top: -$(this).outerHeight()}, 500);
  });

  $('#question-message').css('visibility', 'hidden');

  $('#waiting-message').css('visibility', 'hidden');

  $('#answer_yes').button().click(function() {
    playSample('yes', true);
    $('#question-message').css('visibility','hidden');
    publishMessage('log', {
      type: 'questionAnswer',
      user: strScreenName,
      timestamp: Math.floor(Date.now()),
      data1: $('#question_content').text(),
      data2: 'yes'
    });
  })

  $('#answer_no').button().click(function() {
    playSample('no', true);
    $('#question-message').css('visibility','hidden');
    publishMessage('log', {
      type: 'questionAnswer',
      user: strScreenName,
      timestamp: Math.floor(Date.now()),
      data1: $('#question_content').text(),
      data2: 'no'
    });
  });

  $('.tenpercent').each(function() {
    var height =  window.innerHeight * 0.08; // Max width for the image
    $(this).css('height', height);
  });

  NORESPONSE2 = true;

  (function loopPublish2() {
    setTimeout(function() {
      if (NORESPONSE2) {
        publishMessage('performer', {
          type: 'state', 
          id: myID
        });
        loopPublish2();
      }
    }, 3000);
  })();

  // this is moved here to support iOS : http://stackoverflow.com/questions/12517000/no-sound-on-ios-6-web-audio-api

  $('#start').button().css({margin:'5px'}).click(function() {
    context.resume();
    $('#name_error_msg').text('');

    strScreenName = $('#screenname').val();
    if (strScreenName.length > 12) {
      $('#name_error_msg').text('screen name is too long');
      return;
    }

    if (textAlphanumeric(strScreenName) == false) {
      $('#name_error_msg').text('Please, use only letters and numbers for the screen name. ');
      return;
    }
    NORESPONSE1 = true;
    publishMessage('performer', {
      type:'create', 
      id: myID, 
      nickname: strScreenName
    });
    (function loopPublish1() {
      setTimeout(function() {
        if (NORESPONSE1) {
          publishMessage('performer', {
            type: 'create', 
            id: myID, 
            nickname: strScreenName
          });
          loopPublish1();
        }
      }, 3000);
    })();
    $('#name_error_msg').text('Waiting for response...');
    
    if (soundEnabled) {
      var masterGain = context.createGain();
      masterGain.gain.value = 0.7;
      masterGain.connect(context.destination);
      compressor.connect(masterGain);
      reverb.connect(compressor);
    }

    var testOsc = context.createOscillator();
    testOsc.connect(compressor);
    testOsc.start(0);
    testOsc.stop(context.currentTime + 0.3);
    
  });
  
  $('#browse').click(function() {
    publishMessage('log', {
      type: 'stateChange',
      user: strScreenName,
      timestamp: Math.floor(Date.now()),
      data1: 'EDIT',
      data2: 'BROWSE'
    });
    getNewPattern('next');
  });

  $('#nextPattern').click(function() {
    getNewPattern('next');
  });
  
  $('#prevPattern').click(function() {
    getNewPattern('prev');
  });
  
  $('#randomize').click(function() {
    randomizeNote();
    publishMessage('log', {
      type: 'randomize',
      user: strScreenName,
      timestamp: Math.floor(Date.now())
    });
  });
  
  $('#modify').click(function() {
    state = 'EDIT';
    $('#submit_pane').css('visibility', 'visible');
    $('#bottom_banner').css('visibility', 'hidden');
    $('#top_banner').css('visibility', 'hidden');
    publishMessage('log', {
      type: 'stateChange',
      user: strScreenName,
      timestamp: Math.floor(Date.now()),
      data1: 'BROWSE',
      data2: 'EDIT'
    });
  });
  
  $('#like').click(function() {
    publishMessage('performer', {
      type: 'liked', 
      index: myIndex, 
      likedindex: indexElse
    });
    liked.push(indexElse);
    $('#like').addClass('red');
  });
  
  $('#viewAll').click(function() {
    state = 'WAIT';
    $('#waiting-message').css('visibility', 'visible');
    $('#screenBlock').css('visibility', 'visible');

    publishMessage('performer', {
      type: 'viewAll',
      index: myIndex
    });
  });
  
  $('#browseFromView').click(function() {
    state = 'BROWSE';
    $('#screenBlock').css('visibility', 'hidden');
    $('#viewTableContainer').css('visibility', 'hidden');
  });
  
  $('#screenBlock').click(function() {
    if (state == 'VIEWALL') {
      state = 'BROWSE';
      $('#screenBlock').css('visibility', 'hidden');
      $('#viewTableContainer').css('visibility', 'hidden');
    }
  });
  
  // user clicks an eye icon
  $('#usersTable').on('click', '.view', function() {
    state = 'WAIT';
    $('#waiting-message').css('visibility', 'visible');
    $('#viewTableContainer').css('visibility', 'hidden');
    publishMessage('performer', {
      type: 'followUser',
      index: myIndex,
      followIndex: this.id.slice(-1)
    });
  });
  
  $('#requestsTable').on('click', '.response', function() {
    // user accepts a request
    if ($(this).hasClass('accept')) {
      if (requestTo != -1) {
        publishMessage('performer', {
          type: 'cancelRequest',
          index: myIndex,
          targetIndex: requestTo
        });
        requestTo = -1;
      }
      state = 'WAIT';
      $('#waiting-message').css('visibility', 'visible');
      $('#requestTableContainer').css('visibility', 'hidden');

      publishMessage('performer', {
        type: 'mingleYes',
        index: myIndex,
        sender: this.id.slice(-1)
      });
      
      // removes sender from list
      requestsFrom.splice(requestsFrom.indexOf(this.id.slice(-1)), 1);
    }
    // user ignores a request
    else if ($(this).hasClass('ignore')) {
      // gets nickname by removing 'AcceptIgnore ' from grandparent text
      var nickname = $(this).parent().parent().text().slice(0, -13);
      // last digit of element id
      var index = this.id.slice(-1);
      
      // moves user from 'pending requests' to 'other users'
      removeRequestRow(nickname);
      addUserRow(nickname, index);
      
      publishMessage('performer', {
        type: 'mingleNo',
        sender: this.id.slice(-1)
      });
      
      // removes sender from list
      requestsFrom.splice(requestsFrom.indexOf(this.id.slice(-1)), 1);
    }
  });
  
  $('#mingle').click(function() {
    if ($('#mingle').hasClass('dimmed')) {
      publishMessage(idElse, {
        type: 'queryState',
        id: myID,
        nickname: currentRequestNickname
      });
    }
    else if ($('#mingle').hasClass('clicked')) {
      publishMessage('performer', {
        type: 'cancelRequest',
        index: myIndex,
        targetIndex: requestTo
      });
      requestTo = -1;
      $('#mingle').removeClass('clicked');
      $('#mingleIcon').css('opacity', '1');
      $('#mingleText').empty();
    }
    else {
      requestTo = indexElse;
      publishMessage('performer', {
        type: 'mingle',
        index: myIndex,
        followIndex: indexElse
      });
      $('#mingle').addClass('clicked');
      $('#mingleIcon').css('opacity', '0.2');
      $('#mingleText').empty().append('pending request to ' + nicknameElse + 
                              ' - press here to cancel');
    }
  });
  
  $('#mingleYes').click(function() {
    $('#notifyDot').css('visibility', 'hidden');
    if (requestTo != -1) {
      publishMessage('performer', {
        type: 'cancelRequest',
        index: myIndex,
        targetIndex: requestTo
      });
      requestTo = -1;
    }
    state = 'WAIT';
    $('#waiting-message').css('visibility', 'visible');
    $('#screenBlock').css('visibility', 'visibile');

    // sender should be the most recent entry in requestsFrom
    var senderIndex = requestsFrom[requestsFrom.length - 1];
    publishMessage('performer', {
      type: 'mingleYes',
      index: myIndex,
      sender: senderIndex
    });
    requestsFrom.splice(requestsFrom.indexOf(senderIndex), 1);
  });
  
  $('#mingleNo').click(function() {
    $('#notifyDot').css('visibility', 'hidden');
    var senderIndex = requestsFrom[requestsFrom.length - 1];
    
    publishMessage('performer', {
      type: 'mingleNo',
      sender: senderIndex
    });
    requestsFrom.splice(requestsFrom.indexOf(senderIndex), 1);
  });
  
  $('#exit').click(function() {
    publishMessage('performer', {
      type: 'exitMingle',
      idElse: idElse
    });
    exit();
  });
  
  function exit() {
    state = 'WAIT';
    publishMessage('performer', {
      type: 'whereami', 
      index: myIndex
    });
    $('#waiting-message').css('visibility', 'visible');
    $('#mingle_pane').css('visibility', 'hidden');
    $('#like').css('visibility', 'hidden');
    
    for (var i = 0; i < pattern.length; i++) {
      pattern[i].setPosition(originalPattern[i].x, originalPattern[i].y);
      pattern[i].distance = originalPattern[i].distance;
    }

    publishMessage('log', {
      type: 'stateChange',
      user: strScreenName,
      timestamp: Math.floor(Date.now()),
      data1: 'MINGLE',
      data2: 'BROWSE',
      data3: nicknameElse
    });
  }
  
  var playBarNote = -1;
  var playBarNoteElse = -1;
  var intervalBetweenPattern = 1000;
  var interval = intervalBetweenPattern;
  var intervalElse = intervalBetweenPattern;
  var progress = 0;
  var progressElse = 0;
  var lastPingTime = Date.now();
  var lastPingTimeElse = Date.now();
  var speed = 0.3; // 300 pixel per second (1000 ms);
  var speedElse = 0.3; // 300 pixel per second (1000 ms);


  function init() {
    canvas = $('#patternCanvas')[0];

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight * 0.9;
    w = canvas.width;
    h = canvas.height;
    noteSize = Math.min(w, h) / 12;

    randomizeNote();

    // Add eventlistener to canvas
    canvas.addEventListener('touchmove', touchHandler, false);
    canvas.addEventListener('mousemove', mouseHandler, false);

    draw();
  }

  init();
  
  function draw() {
    canvas = $('#patternCanvas')[0];
    var ctx = canvas.getContext('2d');

    // Clear the canvas
    ctx.clearRect(0, 0, w, h);
    var weightSum = 0;
    for (var i = 0; i < selectedScale.length; i++) {
      weightSum += selectedScaleWeight[i];
    }
    var accHeight = 0;
    if (state == 'EDIT' || state == 'MINGLE' || state == 'BROWSE' || state == 'WAIT') {
       for (var i = 0; i < selectedScale.length; i++) {
         ctx.beginPath();
         var height = h * selectedScaleWeight[selectedScale.length - i - 1] / weightSum;
         ctx.rect(0, accHeight, w, height);
         accHeight += height;
         if (i % 2 == 0)
           ctx.fillStyle = '#f8f8f5';
         else
           ctx.fillStyle = '#e9e3e0';
         ctx.fill();
       }
    }

    if (state == 'EDIT' || state == 'MINGLE' || state == 'WAIT') {
      for (var i = 0; i < patternSize; i++) {
        drawCircle(ctx,pattern[i].x * w, pattern[i].y * h, noteSize, '#83eb9f');
        if (i < patternSize-1) {
          drawLine(ctx,pattern[i].x * w, pattern[i].y * h, 
                   pattern[i+1].x * w, pattern[i+1].y * h, '#57bd72');
        }
        drawCircle(ctx,pattern[i].x * w, pattern[i].y * h, noteSize/3, '#57bd72');
      }

      if (playBarNote >= 0) {
        var playBarCircleX = pattern[playBarNote].x * (1-progress) + 
            pattern[playBarNote+1].x * (progress);
        var playBarCircleY = pattern[playBarNote].y * (1-progress) + 
            pattern[playBarNote+1].y * (progress);
          
        drawCircle(ctx, playBarCircleX * w, playBarCircleY * h, noteSize/2 , '#fdff85');
      }
    }

    if (state == 'BROWSE' || state == 'MINGLE') {
      for (var i = 0; i < patternElse.length; i++) {
        drawCircle(ctx,patternElse[i].x * w, patternElse[i].y * h, noteSize-2, '#ff969d');
        if (i < patternElse.length-1) {
          drawLine(ctx,patternElse[i].x * w, patternElse[i].y * h, 
                   patternElse[i+1].x * w, patternElse[i+1].y * h, '#d16970');
        }
        drawCircle(ctx, patternElse[i].x * w, patternElse[i].y * h, noteSize/3, '#d16970');
      }
      
      if (playBarNoteElse >= 0) {
        var playBarCircleX = patternElse[playBarNoteElse].x * 
            (1-progressElse) + patternElse[playBarNoteElse+1].x * (progressElse);
        var playBarCircleY = patternElse[playBarNoteElse].y * 
            (1-progressElse) + patternElse[playBarNoteElse+1].y * (progressElse);

        drawCircle(ctx,playBarCircleX * w, playBarCircleY * h, noteSize/2, '#fdff85');
      }
    }
  }

  var animate = function() {
    window.requestAnimFrame(animate);
    if (state == 'NAME')
      return;
    var currentTime = Date.now();
    var intervalInSec = interval/1000;
    var oscType = ['sine','sine','triangle','triangle','sawtooth','square','triangle','sawtooth','square' ];
    var detune = 20;
    var maxNumOsc = oscType.length;

    if (state == 'EDIT' || state == 'MINGLE' || state == 'WAIT') {
      progress = (currentTime - lastPingTime ) / interval;
      if (playBarNote < 0 && lastPingTime + interval < currentTime) {
        playBarNote++;
        lastPingTime = currentTime;
        interval = pattern[playBarNote].distance / speed;
        intervalInSec = interval/1000;
        progress = 0;

        if (soundEnabled) {
          var numOsc = Math.floor(pattern[playBarNote].x * maxNumOsc )  + 1;
          var numDetune = Math.floor(pattern[playBarNote].x * detune );
          var pitchIndex = getPitchIndex(1 - pattern[playBarNote].y);
          var octave = Math.floor(pitchIndex / selectedScale.length);
          var voice = new ScissorVoice(baseNote + selectedScale[pitchIndex] + octave * 12, 
                                       numOsc, oscType, detune);
          voice.stop(context.currentTime + intervalInSec * 0.7);
          voice.connect(reverb);
          voice.output.play(0, intervalInSec*0.1,intervalInSec*0.1, intervalInSec*0.4, 
                            intervalInSec*0.1, voice.maxGain*2.0, voice.maxGain);
        }
      }
      else if (playBarNote >= 0 && lastPingTime + interval < currentTime) {
        playBarNote++;
        progress = 0;
        var numOsc = Math.floor(pattern[playBarNote].x * maxNumOsc) + 1;
        var numDetune = Math.floor(pattern[playBarNote].x * detune );
        var pitchIndex = getPitchIndex(1 - pattern[playBarNote].y);
        var octave = Math.floor(pitchIndex / selectedScale.length);

        lastPingTime = currentTime;

        if (playBarNote == patternSize-1) {
          interval = intervalBetweenPattern;
          playBarNote = -1;
        } else {
          interval = pattern[playBarNote].distance / speed;
        }
        intervalInSec = interval/1000;
        if (soundEnabled) {
          var voice = new ScissorVoice(baseNote + selectedScale[pitchIndex] + octave * 12, 
                                       numOsc, oscType, detune);
          voice.stop(context.currentTime + intervalInSec * 0.7);
          voice.connect(reverb);
          voice.output.play(0, intervalInSec*0.1, intervalInSec*0.1, intervalInSec*0.4, 
                            intervalInSec*0.1, voice.maxGain*2.0, voice.maxGain);
        }
      }
    } // end of if (state == 'EDIT' || state == 'MINGLE') {

    if (state == 'BROWSE' || state == 'MINGLE') {
      
      progressElse = (currentTime - lastPingTimeElse ) / intervalElse;
      if (playBarNoteElse < 0 && lastPingTimeElse + intervalElse < currentTime) {
        playBarNoteElse++;
        progressElse = 0;
        lastPingTimeElse = currentTime;
        intervalElse = patternElse[playBarNoteElse].distance / speedElse;
        intervalInSec = interval/1000;
        if (soundEnabled) {
          var numOsc = Math.floor(patternElse[playBarNoteElse].x * maxNumOsc) + 1;
          var numDetune = Math.floor(patternElse[playBarNoteElse].x * detune);
          var pitchIndex = getPitchIndex(1 - patternElse[playBarNoteElse].y);
          var octave = Math.floor(pitchIndex / selectedScale.length);
          var voice = new ScissorVoice(baseNote + selectedScale[pitchIndex] + 
                                         octave * 12,numOsc,oscType, detune);
          voice.stop(context.currentTime + intervalInSec * 0.7);
          voice.connect(reverb);
          voice.output.play(0, intervalInSec*0.1, intervalInSec*0.1, intervalInSec*0.4, 
                            intervalInSec*0.1, voice.maxGain*2.0, voice.maxGain);
        }
      }
      else if (playBarNoteElse >= 0 && lastPingTimeElse + intervalElse < currentTime) {
        playBarNoteElse++;
        progressElse = 0;
        var numOsc = Math.floor(patternElse[playBarNoteElse].x * maxNumOsc) + 1;
        var numDetune = Math.floor(patternElse[playBarNoteElse].x * detune);
        var pitchIndex =getPitchIndex(1 - patternElse[playBarNoteElse].y);

        var octave = Math.floor(pitchIndex / selectedScale.length);

        lastPingTimeElse = currentTime;

        if (playBarNoteElse == patternElse.length-1) {
          intervalElse = intervalBetweenPattern;
          playBarNoteElse = -1;
        } else {
          intervalElse = patternElse[playBarNoteElse].distance / speedElse;
        }
        intervalInSec = interval/1000;
        if (soundEnabled) {
          var voice = new ScissorVoice(baseNote + selectedScale[pitchIndex] + octave * 12, 
                                       numOsc, oscType, detune);
          voice.stop(context.currentTime + intervalInSec * 0.7);
          voice.connect(reverb);
          voice.output.play(0,intervalInSec*0.1,intervalInSec*0.1,intervalInSec*0.4,
                            intervalInSec*0.1,voice.maxGain*2.0,voice.maxGain );
        }
      }
    } // end of if (state == 'EDIT' || state == 'MINGLE') {
    draw();
  };

  animate();
  
  var selectedNote = -1;
  
  $(document).bind('touchstart', function(event) {
    if (state == 'WAIT') return;
    // Left mouse button was pressed, set flag
    var minDistance = 100000;
    var tempNoteID = -1;
    var e = event.originalEvent.changedTouches[0];

    for (var i = 0; i < patternSize; i++) {
      var distance = dist(e.pageX, e.pageY, pattern[i].x * w, pattern[i].y * h);
      if (minDistance >= distance) {
        minDistance = distance;
        tempNoteID = i;
      }
    }

    if (tempNoteID > -1 && minDistance < noteSize) {
      selectedNote = tempNoteID;
    }
  });
  
  function touchHandler() {
    //Assume only one touch/only process one touch even if there's more
    var e = event.targetTouches[0];
    if (selectedNote < 0) return;

    // Assign new coordinates to our object
    pattern[selectedNote].setPosition((e.pageX -  noteSize / 2) / w, (e.pageY -  noteSize / 2) / h);
    pattern[selectedNote].distance = dist(pattern[selectedNote].x * w, pattern[selectedNote].y * h,
      pattern[(1+selectedNote)%patternSize].x * w, pattern[(1+selectedNote)%patternSize].y * h);
    if (selectedNote > 0)
      pattern[selectedNote-1].distance = dist(pattern[selectedNote].x * w, pattern[selectedNote].y * h,
      pattern[selectedNote-1].x * w, pattern[selectedNote-1].y * h);

    // Redraw the canvas
    draw();
    event.preventDefault();
  }

  $(document).bind('touchend',function(event) {
    selectedNote = -1;
    var e = event.originalEvent.changedTouches[0];
    var minDistance = 100000;
    var tempNoteID = -1;

    for (var i = 0; i < patternSize; i++) {
      var distance = dist(e.pageX, e.pageY, pattern[i].x * w, pattern[i].y * h);
      if (minDistance >= distance) {
        minDistance = distance;
        tempNoteID = i;
      }
    }
    if (tempNoteID > -1 && minDistance < noteSize) {
      publishMessage('performer', {
        type: 'update',
        index: myIndex,
        pattern: pattern
      });
      if (state == 'MINGLE') {
        publishMessage(idElse, {
          type: 'mingleMove',
          pattern: pattern
        });
      }
      if (state == 'EDIT' || state == 'MINGLE') {
        var patternStr = '"' + JSON.stringify(pattern).replace(/"/g, '""') + '"';
        for (var i = 0; i < pattern.length; ++i) {
          pattern[i].distance = parseFloat(pattern[i].distance).toFixed(3);
        }
        publishMessage('log', {
          type: 'noteMove',
          user: strScreenName,
          timestamp: Math.floor(Date.now()),
          data1: state,
          data2: patternStr
        });
      }
    }
  });
  
  $(document).mousedown(function(e) {
    if (state == 'WAIT') return;
    // Left mouse button was pressed, set flag
    var minDistance = 100000;
    var tempNoteID = -1;

    for (var i = 0; i < patternSize; i++) {
      var distance = dist(e.pageX, e.pageY, pattern[i].x * w, pattern[i].y * h);
      if (minDistance >= distance) {
        minDistance = distance;
        tempNoteID = i;
      }
    }

    if (tempNoteID > -1 && minDistance < noteSize) {
      selectedNote = tempNoteID;
    }
  });
  
  function mouseHandler(e) {
    if (selectedNote < 0)
      return;

    // Assign new coordinates to our object
    pattern[selectedNote].setPosition((e.pageX - noteSize / 2) / w, (e.pageY - noteSize / 2) / h);
    pattern[selectedNote].distance = dist(pattern[selectedNote].x * w, pattern[selectedNote].y * h,
      pattern[(1+selectedNote)%patternSize].x * w, pattern[(1+selectedNote)%patternSize].y * h);
    if (selectedNote > 0)
      pattern[selectedNote-1].distance = dist(pattern[selectedNote].x * w, pattern[selectedNote].y * h,
      pattern[selectedNote-1].x * w, pattern[selectedNote-1].y * h);

    // Redraw the canvas
    draw();

    event.preventDefault();
  }

  $(document).mouseup(function(e) {
    // Left mouse button was released, clear flag
    selectedNote = -1;
    var minDistance = 100000;
    var tempNoteID = -1;

    for (var i = 0; i < patternSize; i++) {
      var distance = dist(e.pageX, e.pageY, pattern[i].x * w, pattern[i].y * h);
      if (minDistance >= distance) {
        minDistance = distance;
        tempNoteID = i;
      }
    }
    if (tempNoteID > -1 && minDistance < noteSize) {
      publishMessage('performer', {
        type: 'update',
        index: myIndex,
        pattern: pattern
      });
      if (state == 'MINGLE') {
        publishMessage(idElse, {
          type: 'mingleMove',
          pattern: pattern
        });
      }
      if (state == 'EDIT' || state == 'MINGLE') {
        for (var i = 0; i < pattern.length; ++i) {
          pattern[i].distance = parseFloat(pattern[i].distance).toFixed(3);
        }
        var patternStr = '"' + JSON.stringify(pattern).replace(/"/g, '""') + '"';
        
        publishMessage('log', {
          type: 'noteMove',
          user: strScreenName,
          timestamp: Math.floor(Date.now()),
          data1: state,
          data2: patternStr
        });
      }
    }
  });
});
