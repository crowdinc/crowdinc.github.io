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

function parseMessage(m) {
  $('#interactions').append(m.type);
}

function parsePresence(p) {

}