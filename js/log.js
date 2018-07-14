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
    parsePresence(p);
  }
});

pubnub.subscribe({
  channels: ['log'],
  withPresence: true,
  heartbeat: 15
});

$(document).ready(function() {
  
});

var startTime;

function parseMessage(m) {
  if (m.type == 'golive') startTime = m.timestamp;
  $('#actionTypes').append(m.type + '<br/>');
  $('#actingUsers').append(m.user + '<br/>');
  $('#timestamps').append((m.timestamp - startTime) + '<br/>');
  $('#info').append(JSON.stringify(m.info) + '<br/>');
}

function parsePresence(p) {

}