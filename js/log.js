var pubnub = new PubNub({
  subscribeKey: subscribeKey,
  publishKey: publishKey,
  uuid: PubNub.generateUUID(),
  ssl: (('https:' == document.location.protocol) ? true : false)
});

pubnub.addListener({
  message: function(m) {
    parseMessage(m.message);
  }
});

pubnub.subscribe({
  channels: ['log'],
  withPresence: true,
  heartbeat: 15
});

var startTime;

function parseMessage(m) {
  if (m.type == 'total refresh') window.location.reload();
  if (m.type == 'join' && m.user == 'performer') startTime = m.timestamp;
  
  // add a row containing the info in the message
  $('#interactions').append('<div class="row">' + 
                              '<div class="col-3">' + m.type + '</div>' + 
                              '<div class="col-3">' + m.user + '</div>' + 
                              '<div class="col-3">' + (m.timestamp - startTime) + '</div>' + 
                              '<div class="col-3">' + JSON.stringify(m.info) + '</div>' + 
                            '</div>');
  window.scrollTo(0, document.body.scrollHeight);
}


