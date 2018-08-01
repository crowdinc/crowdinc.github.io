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
  else if (m.type == 'join' && m.user == 'performer') startTime = m.timestamp;
  else if (m.type == 'epoch') {
    startTime = m.epoch;
    return;
  }
  if (!m.data1) m.data1 = '';
  if (!m.data2) m.data2 = '';
  if (!m.data3) m.data3 = '';
  
  // add a row containing the info in the message
  $('#actions').append(m.type + ',' + m.user + ',' + (m.timestamp - startTime) 
                       + ',' + m.data1 + ',' + m.data2 + ',' + m.data3 + '<br/>');
  
  
  // html table method
  /*$('#actionsTable').append('<tr><td>' + m.type + '</td><td>' 
                            + m.user + '</td><td>' 
                            + (m.timestamp - startTime) + '</td><td>' 
                            + m.data1 +  '</td><td>'
                            + m.data2 +  '</td><td>'
                            + m.data3 +  '</td></tr>');*/
  
  window.scrollTo(0, document.body.scrollHeight);
}

$(document).ready(function() {
  $('#csvButton').click(function() {
    $('#actionsTable').table2CSV();
  });
  pubnub.publish({
    channel: 'performer',
    message: {
      type: 'sendEpoch'
    }
  });
});

