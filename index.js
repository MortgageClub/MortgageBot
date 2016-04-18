var express = require('express');
var app = express();
var request = require('request');
var bodyParser = require('body-parser');
var Wit = require('node-wit').Wit;
require('dotenv').config();
////
app.set('port', (process.env.PORT || 5000));

app.use(express.static(__dirname + '/public'));

app.get('/', function(request, response) {
  response.send('Hello world !');
});
//token for webhook
var verifyToken = process.env.VERIFY_TOKEN;
// token of fb page
var token = process.env.FB_PAGE_TOKEN;
// Wit.ai parameters
var WIT_TOKEN = process.env.WIT_TOKEN;
// Messenger API parameters
var FB_PAGE_ID = process.env.FB_PAGE_ID;
if (!FB_PAGE_ID || !WIT_TOKEN || !token || !verifyToken) {
  throw new Error('missing Env var');
}
app.use(bodyParser.json());

var welcome = "Hello, I can help you get a rate quote in 10 secs. To get started, please let me know whether this is a purchase or refinance loan";
var btnPurposeTypes = [
  {
    "type":"postback",
    "title":"Purchase",
    "payload":"purchase"
  },
  {
    "type":"postback",
    "title":"Refinance",
    "payload":"refinance"
  }
];
 //single family home, duplex, triplex, fourplex, or condo
var btnProperties = [
  {
    "type":"postback",
    "title":"Primary Residence",
    "payload":"primary_residence"
  },
  {
    "type":"postback",
    "title":"Vacation Home",
    "payload":"vacation_home"
  },
  {
    "type":"postback",
    "title":"Rental Property",
    "payload":"rental_property"
  }
];

var btnPropertyTypes = [
  {
    "type":"postback",
    "title":"Single Family Home",
    "payload":"sfh"
  },
  {
    "type":"postback",
    "title":"Duplex",
    "payload":"duplex"
  },
  {
    "type":"postback",
    "title":"Triplex",
    "payload":"triplex"
  }
];

// find first entity value
var firstEntityValue = function(entities, entity) {
  var val = entities && entities[entity] &&
    Array.isArray(entities[entity]) &&
    entities[entity].length > 0 &&
    entities[entity][0].value
  ;
  if (!val) {
    return null;
  }
  return typeof val === 'object' ? val.value : val;
};
// Our bot actions
var actions = {
  say: function(sessionId, context, msg, cb) {
    // Our bot has something to say!
    // Let's retrieve the Facebook user whose session belongs to
    var recipientId = sessions[sessionId].fbid;
    if (recipientId) {
      // Yay, we found our recipient!
      // Let's forward our bot response to her.
      sendTextMessage(recipientId, msg);
      cb();
    } else {
      console.log('Oops! Couldn\'t find user for session:', sessionId);
      // Giving the wheel back to our bot
      cb();
    }
  },
  merge: function(sessionId, context, entities, message, cb) {
    var purpose = firstEntityValue(entities, 'purpose');
    if(purpose !== null) {
      sessions[context.sessionId].context.purpose = purpose;
      context.purpose = purpose;
    }
    var numberStr = firstEntityValue(entities, 'number');
    if(numberStr !== null) {
      sessions[context.sessionId].context.numberStr = numberStr;
    }
    var usage = firstEntityValue(entities, 'usage');
    if(usage !== null) {
      sessions[context.sessionId].context.usage = usage;
      context.usage = usage;
    }
    var propertyType = firstEntityValue(entities, 'property_type');
    if(usage !== null) {
      sessions[context.sessionId].context.propertyType = propertyType;
      context.propertytype = propertyType;
    }
    cb(context);
  },
  'welcome': function(sessionId, context, cb) {
    sendButtonMessage(sessions[context.sessionId].fbid, welcome, btnPurposeTypes);
    cb(context);
  },
  'purchase-price': function(sessionId, context, cb) {
    sessions[context.sessionId].context.purchaseprice = sessions[context.sessionId].context.numberStr;
    context.purchaseprice = sessions[context.sessionId].context.purchaseprice;
    cb(context);
  },
  'down-payment': function(sessionId, context, cb) {
    sessions[context.sessionId].context.downpayment = sessions[context.sessionId].context.numberStr;
    context.downpayment = sessions[context.sessionId].context.downpayment;
    sendButtonMessage(sessions[context.sessionId].fbid, "Excellent, is this a ", btnProperties);
    cb(context);
  },
  'usage-purchase': function(sessionId, context, cb) {
    sendButtonMessage(sessions[context.sessionId].fbid, "Awesome, is this a ", btnPropertyTypes);
    cb(context);
  },
  'property-type-purchase': function(sessionId, context, cb) {
    sendTextMessage(sessions[context.sessionId].fbid, "Okay, last question, what's your credit score?");
    cb(context);
  },
  'credit-purchase': function(sessionId, context, cb) {
    sessions[context.sessionId].context.creditScore = sessions[context.sessionId].context.numberStr;
    context.creditscore = sessions[context.sessionId].context.creditScore;
    sendTextMessage(sessions[context.sessionId].fbid, "Good news, I've found mortgage loans for you. Lowest rates as of today: ");
    console.log(context);
    cb(context);
  },

  error: function(sessionid, context, err) {
    console.log('Oops, I don\'t know what to do.');
  },
  // You should implement your custom actions here
  // See https://wit.ai/docs/quickstart
};

// Setting up our bot
var wit = new Wit(WIT_TOKEN, actions);

// This will contain all user sessions.
// Each session has an entry:
// sessionId -> {fbid: facebookUserId, context: sessionState}
var sessions = {};

function findOrCreateSession(fbid) {
  var sessionId;
  // Let's see if we already have a session for the user fbid
  Object.keys(sessions).forEach(function(k){
    if (sessions[k].fbid === fbid) {
      // Yep, got it!
      sessionId = k;
    }
  });
  if (!sessionId) {
    // No session found for user fbid, let's create a new one
    sessionId = new Date().toISOString();
    sessions[sessionId] = {fbid: fbid, context: {}};
  }
  return sessionId;
}

// Verify token for webhook
app.get('/webhook', function (req, res) {
  if (req.query['hub.verify_token'] === verifyToken) {
    res.send(req.query['hub.challenge']);
  } else {
    res.send('Error, wrong validation token');
  }
});
// receive messages from user on fb
app.post('/webhook/', function (req, res) {
  //var messaging = getFirstMessagingEntry(req.body);
  messaging_events = req.body.entry[0].messaging;
  var sessionId = null;
  var msg = null;
  for (i = 0; i < messaging_events.length; i++) {
    event = req.body.entry[0].messaging[i];
    // Yay! We got a new message!

    // We retrieve the Facebook user ID of the sender
    var sender = event.sender.id;

    // We retrieve the user's current session, or create one if it doesn't exist
    // This is needed for our bot to figure out the conversation history
    sessionId = findOrCreateSession(sender);

    // We retrieve the message content
    sessions[sessionId].context.sessionId = sessionId;

    if (event.message && event.message.text && event.recipient.id === FB_PAGE_ID) {
        msg = event.message.text;
    }
    if (event.postback) {
        msg = event.postback.payload;
    }
  }
  wit.runActions(
    sessionId, // the user's current session
    msg, // the user's message
    sessions[sessionId].context, // the user's current session state
    function(error, context) {
      if (error) {
        console.log('Oops! Got an error from Wit:', error);
      } else {
        // Our bot did everything it has to do.
        // Now it's waiting for further messages to proceed.
        console.log('Waiting for futher messages.');

        // Based on the session state, you might want to reset the session.
        // This depends heavily on the business logic of your bot.
        // Example:
        // if (context['done']) {
        //   delete sessions[sessionId];
        // }

        // Updating the user's current session state
        // sessions[sessionId].context = context;
      }
    }
  );

  res.sendStatus(200);
});


function sendTextMessage(sender, text) {
  messageData = {
    text:text
  };
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {access_token:token},
    method: 'POST',
    json: {
      recipient: {id:sender},
      message: messageData,
    }
  }, function(error, response, body) {
    if (error) {
      console.log('Error sending message: ', error);
    } else if (response.body.error) {
      console.log('Error: ', response.body.error);
    }
  });
}

function sendGenericMessage(sender) {
  messageData = {
    "attachment": {
      "type": "template",
      "payload": {
        "template_type": "generic",
        "elements": [{
          "title": "First card",
          "subtitle": "Element #1 of an hscroll",
          "image_url": "http://messengerdemo.parseapp.com/img/rift.png",
          "buttons": [{
            "type": "web_url",
            "url": "https://www.messenger.com/",
            "title": "Web url"
          }, {
            "type": "postback",
            "title": "Postback",
            "payload": "Payload for first element in a generic bubble",
          }],
        },{
          "title": "Second card",
          "subtitle": "Element #2 of an hscroll",
          "image_url": "http://messengerdemo.parseapp.com/img/gearvr.png",
          "buttons": [{
            "type": "postback",
            "title": "Postback",
            "payload": "Payload for second element in a generic bubble",
          }],
        }]
      }
    }
  };
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {access_token:token},
    method: 'POST',
    json: {
      recipient: {id:sender},
      message: messageData,
    }
  }, function(error, response, body) {
    if (error) {
      console.log('Error sending message: ', error);
    } else if (response.body.error) {
      console.log('Error: ', response.body.error);
    }
  });
}

function sendButtonMessage(sender, text, buttons) {
  messageData = {
    "attachment":{
      "type":"template",
      "payload":{
        "template_type":"button",
        "text": text,
        "buttons": buttons
      }
    }
  };
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {access_token:token},
    method: 'POST',
    json: {
      recipient: {id:sender},
      message: messageData,
    }
  }, function(error, response, body) {
    if (error) {
      console.log('Error sending message: ', error);
    } else if (response.body.error) {
      console.log('Error: ', response.body.error);
    }
  });
}

app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});
