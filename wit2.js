'use strict';

const bodyParser = require('body-parser');
const express = require('express');
const request = require('request');
require('dotenv').config();

const Wit = require('node-wit').Wit;

// Webserver parameter
const PORT = process.env.PORT || 5000;

// Wit.ai parameters
const WIT_TOKEN = process.env.WIT_TOKEN;

// Messenger API parameters
const FB_PAGE_ID = process.env.FB_PAGE_ID && Number(process.env.FB_PAGE_ID);
if (!FB_PAGE_ID) {
  throw new Error('missing FB_PAGE_ID');
}
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN;
if (!FB_PAGE_TOKEN) {
  throw new Error('missing FB_PAGE_TOKEN');
}
const FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;

// Messenger API specific code
var welcome = "Hello, I can help you get a rate quote in 10 secs. To get started, please let me know whether this is a purchase or refinance loan.";

// See the Send API reference
// https://developers.facebook.com/docs/messenger-platform/send-api-reference
const fbReq = request.defaults({
  uri: 'https://graph.facebook.com/me/messages',
  method: 'POST',
  json: true,
  qs: { access_token: FB_PAGE_TOKEN },
  headers: {'Content-Type': 'application/json'},
});

const fbMessage = (recipientId, msg, cb) => {
  const opts = {
    form: {
      recipient: {
        id: recipientId,
      },
      message: {
        text: msg,
      },
    },
  };
  fbReq(opts, (err, resp, data) => {
    if (cb) {
      cb(err || data.error && data.error.message, data);
    }
  });
};
function sendButtonMessage(sender, text, buttons) {
  const messageData = {
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
    qs: {access_token:FB_PAGE_TOKEN},
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
function sendTextMessage(sender, text) {
  const messageData = {
    text:text
  };
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {access_token:FB_PAGE_TOKEN},
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
// See the Webhook reference
// https://developers.facebook.com/docs/messenger-platform/webhook-reference
const getFirstMessagingEntry = (body) => {
  const val = body.object == 'page' &&
    body.entry &&
    Array.isArray(body.entry) &&
    body.entry.length > 0 &&
    body.entry[0] &&
    body.entry[0].id == FB_PAGE_ID &&
    body.entry[0].messaging &&
    Array.isArray(body.entry[0].messaging) &&
    body.entry[0].messaging.length > 0 &&
    body.entry[0].messaging[0]
  ;
  return val || null;
};
// find first entity value
var firstEntityValue = (entities, entity) => {
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
// Wit.ai bot specific code

// This will contain all user sessions.
// Each session has an entry:
// sessionId -> {fbid: facebookUserId, context: sessionState}
const sessions = {};

const findOrCreateSession = (fbid) => {
  let sessionId;
  // Let's see if we already have a session for the user fbid
  Object.keys(sessions).forEach(k => {
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
};
// function buttonMessage(text, buttons) {
//   return {
//     "attachment":{
//       "type":"template",
//       "payload":{
//         "template_type":"button",
//         "text": text,
//         "buttons": buttons
//       }
//     }
//   };
// }
// purpose types
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
   "title":"Multi-Family",
   "payload":"multi_family"
 },
 {
   "type":"postback",
   "title":"Condo/Townhouse",
   "payload":"condo"
 }
];

// function sendFbMessage(sessionId, message){
//   const recipientId = sessions[sessionId].fbid;
//   if (recipientId) {
//     // Yay, we found our recipient!
//     // Let's forward our bot response to her.
//     fbMessage(recipientId, message, (err, data) => {
//       if (err) {
//         console.log(
//           'Oops! An error occurred while forwarding the response to',
//           recipientId,
//           ':',
//           err
//         );
//       }
//
//       // Let's give the wheel back to our bot
//     });
//   } else {
//     console.log('Oops! Couldn\'t find user for session:', sessionId);
//     // Giving the wheel back to our bot
//   }
// }
// Our bot actions
const actions = {
  say: (sessionId, context, message, cb) => {
    // Our bot has something to say!
    // Let's retrieve the Facebook user whose session belongs to
    const recipientId = sessions[sessionId].fbid;
    if (recipientId) {
      // Yay, we found our recipient!
      // Let's forward our bot response to her.
      fbMessage(recipientId, message, (err, data) => {
        if (err) {
          console.log(
            'Oops! An error occurred while forwarding the response to',
            recipientId,
            ':',
            err
          );
        }
        // Let's give the wheel back to our bot
        cb();
      });
    } else {
      console.log('Oops! Couldn\'t find user for session:', sessionId);
      // Giving the wheel back to our bot
      cb();
    }
  },
  merge: (sessionId, context, entities, message, cb) => {
    var greeting = firstEntityValue(entities, 'greeting');
    if(greeting != null) {
      sessions[sessionId].context.greeting = greeting;
      context.greeting = greeting;
    }
    var purpose = firstEntityValue(entities, 'purpose');
    if(purpose != null) {
      sessions[sessionId].context.purpose = purpose;
      context.purpose = purpose;
    }

    var numberStr = firstEntityValue(entities, 'number');
    if(numberStr != null) {
      sessions[sessionId].context.numberStr = numberStr;
    }
    var usage = firstEntityValue(entities, 'usage');
    if(usage != null) {
      sessions[sessionId].context.usage = usage;
      context.usage = usage;
    }
    var propertyType = firstEntityValue(entities, 'property_type');
    if(propertyType != null) {
      sessions[sessionId].context.property_type = propertyType;
      context.property_type = propertyType;
    }
    cb(context);
  },
  'welcome': (sessionId, context, cb) => {
    const recipientId = sessions[sessionId].fbid;
    sendButtonMessage(recipientId, welcome, btnPurposeTypes);
    cb(context);
  },
  'zipcode': (sessionId, context, cb) => {
    const recipientId = sessions[sessionId].fbid;
    sessions[sessionId].context.zipcode = sessions[sessionId].context.numberStr;
    context.zipcode = sessions[sessionId].context.zipcode;
    if(context.purpose === "purchase") {
      sendTextMessage(recipientId, "Awesome, how about purchase price? ");
    }else {
      sendTextMessage(recipientId, "Awesome, how about estimated current value? (Hint: use Zillow estimate) ");
    }
    cb(context);
  },
  'property_value': (sessionId, context, cb) => {
    const recipientId = sessions[sessionId].fbid;
    sessions[sessionId].context.property_value = sessions[sessionId].context.numberStr;
    context.property_value = sessions[sessionId].context.property_value;
    if(context.purpose === "purchase") {
      sendTextMessage(recipientId, "How about down payment? ");
    }else {
      sendTextMessage(recipientId, "Current mortgage balance? ");
    }
    cb(context);
  },
  'downpayment_balance': (sessionId, context, cb) => {
    const recipientId = sessions[sessionId].fbid;
    if(context.purpose === "purchase") {
      sessions[sessionId].context.down_payment = sessions[sessionId].context.numberStr;
      context.down_payment = sessions[sessionId].context.down_payment;
      context.mortgage_balance = "";
    }else {
      sessions[sessionId].context.mortgage_balance = sessions[sessionId].context.numberStr;
      context.mortgage_balance = sessions[sessionId].context.mortgage_balance;
      context.down_payment="";
    }
    sendButtonMessage(recipientId, "Excellent, is this a ", btnProperties);
    cb(context);
  },
  'usage': (sessionId, context, cb) => {
    const recipientId = sessions[sessionId].fbid;
    sendButtonMessage(recipientId, "Awesome, is this a ", btnPropertyTypes);
    cb(context);
  },
  'credit_score': (sessionId, context, cb) => {
    const recipientId = sessions[sessionId].fbid;
    sessions[sessionId].context.credit_score = sessions[sessionId].context.numberStr;
    context.credit_score = sessions[sessionId].context.credit_score;
    context.done = true;
    sendTextMessage(recipientId, "Thanks for your using! We will notice you soon.");
    cb(context);
  },
  // 'property-type-purchase': (sessionId, context, cb) => {
  //   const recipientId = sessions[sessionId].fbid;
  //   sendTextMessage(recipientId, "Okay,  what's your credit score?");
  //   cb(context);
  // },
  error: (sessionId, context, error) => {
    console.log(error.message);
  },
};

// Setting up our bot
const wit = new Wit(WIT_TOKEN, actions);

// Starting our webserver and putting it all together
const app = express();
app.set('port', PORT);
app.listen(app.get('port'));
app.use(bodyParser.json());
app.use(express.static(__dirname + '/public'));
//welcome
app.get('/', function(request, response) {
  response.send('Hello world !');
});
// Webhook setup
app.get('/webhook', (req, res) => {
  if (!FB_VERIFY_TOKEN) {
    throw new Error('missing FB_VERIFY_TOKEN');
  }
  if (req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === FB_VERIFY_TOKEN) {
      console.log(req.query['hub.challenge']);
    res.send(req.query['hub.challenge']);
  } else {
    res.sendStatus(400);
  }
});

// Message handler
app.post('/webhook', (req, res) => {
  // Parsing the Messenger API response
  const messaging = getFirstMessagingEntry(req.body);
  if (messaging && messaging.recipient.id === FB_PAGE_ID) {
    // Yay! We got a new message!

    // We retrieve the Facebook user ID of the sender
    const sender = messaging.sender.id;

    // We retrieve the user's current session, or create one if it doesn't exist
    // This is needed for our bot to figure out the conversation history
    const sessionId = findOrCreateSession(sender);

    // We retrieve the message content
    var msg = null;
    // const atts = messaging.message.attachments;

    if (messaging.message && messaging.message.text) {
        msg = messaging.message.text;
    }

    if (messaging.postback) {
        msg = messaging.postback.payload;
    }

    // if (atts) {
    //   // We received an attachment
    //
    //   // Let's reply with an automatic message
    //   fbMessage(
    //     sender,
    //     'Sorry I can only process text messages for now.'
    //   );
    // } else
    if (msg) {
      // We received a text message
      var maxSteps = 10;
      // Let's forward the message to the Wit.ai Bot Engine
      // This will run all actions until our bot has nothing left to do
      wit.runActions(
        sessionId, // the user's current session
        msg, // the user's message
        sessions[sessionId].context,
        // the user's current session state
        (error, context) => {
          if (error) {
            console.log('Oops! Got an error from Wit:', error);
          } else {
            // Our bot did everything it has to do.
            // Now it's waiting for further messages to proceed.
            console.log('Waiting for futher messages.');
            // Updating the user's current session state
            sessions[sessionId].context = context;
            // Based on the session state, you might want to reset the session.
            // This depends heavily on the business logic of your bot.
            // Example:
            if (context['done']) {
              console.log("end of a story !");
              delete sessions[sessionId];
            }


          }
        }, maxSteps
      );
    }
  }
  res.sendStatus(200);
});
