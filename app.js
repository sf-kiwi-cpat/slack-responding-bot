const {App} = require('@slack/bolt');
const {WebClient} = require('@slack/web-api');
const { Client } = require('pg');
const { Pool } = require('pg');

//const client = new Client({
//  connectionString: process.env.DATABASE_URL,
//  ssl: {
//    rejectUnauthorized: false
//  }
//});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on('error', (err, client) => {
    console.error('Error:', err);
});


async function getAllResponses()
{
	const results = await pool.query('SELECT name,channel__c,response__c,regular_expression__c,is_channel_default__c FROM salesforce.Slack_Message_Response__c ORDER BY order__c;');
	if (results.rows) {
		for (let row of results.rows) {
			console.log(JSON.stringify(row));
		}
	}
}

// Initializes your app with your bot token and signing secret
const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET
});

const CHANNEL_REGEX_MAP = new Map();
const BOT_RESPONSE_HELPED = "Glad I could help, happy selling!";
const BOT_RESPONSE_HELPED_EMOTICON = "white_check_mark";
const BOT_RESPONSE_DIDNT_HELP = "No worries, an expert will check this out and help as soon as they can.";
const BOT_RESPONSE_DIDNT_HELP_EMOTICON = "question";


// This is called on the startup of the app - builds out the regular expressions to check per Slack channel
function buildMap() {
    CHANNEL_REGEX_MAP.set('automated-responses', ["WhatsApp", "WeChat", "roadmap"]);
}

// Get the default message as the fallback for a channel.
async function getDefaultMessage(message, channelName)
{
	let defaultMessage = `Thanks for posting <@${message.user}> - I'm just creating a thread for you to keep the channel tidy.`;
	console.debug("Calling to DB. Channel: " + channelName);
	const results = await pool.query('SELECT response__c FROM salesforce.Slack_Message_Response__c WHERE is_channel_default__c = true AND channel__c = $1;', [channelName]);
	if (results.rows) {
		console.debug("Found results...");
		for (let row of results.rows) {
			defaultMessage = row.response__c;
			defaultMessage = defaultMessage.replace("${message.user}",message.user);
			console.debug("Set defaultMessage to: " + defaultMessage);
			break;
		}
	}
	
	return defaultMessage;
}

// Initialize the web client so we can call the API later
const web = new WebClient(process.env.SLACK_BOT_TOKEN);

// Listens to all incoming messages
app.message(async ({message, say}) => {
    console.debug(message);
    // We don't care about messages sent within a thread, only reply to top level messages. So if the message has a thread_ts then ignore it
    if (!message.thread_ts && !message.hidden) {
	    let channelName = await getChannelName(message.channel);
	    console.debug("channel:" + channelName);
	    // Get the list of things to check for for this channel
	    let regexList = await getRegexForChannel(channelName);
	    // Get the default response in case we don't match any of the things to check for above
	    let response =  await getDefaultMessage(message,channelName);
	    // Now check each regular expression and see if it is in the message sent in
	    for (let regex of regexList) {
		console.debug("check regex:" + regex + " \nWith: " + message.text);
	    	if (message.text.match(new RegExp(regex, "i"))) {
			console.debug("matched regex:" + regex);
			response = await getResponseText(regex, message, channelName);
			break; 
		}
	    }
	    sendReply(message, say, response);    
    }
});

// Finds all the regular expressions we want to check the message for this channel
async function getRegexForChannel(channelName)
{
	// Go get the list of regular expressions for this slack channel
	let regexList = [];
	console.debug("Calling to DB. Channel: " + channelName);
	const results = await pool.query('SELECT regular_expression__c FROM salesforce.Slack_Message_Response__c WHERE channel__c = $1;', [channelName]);
	if (results.rows) {
		console.debug("Found results...");
		for (let row of results.rows) {
			regexList.push(row.regular_expression__c);
			console.debug("Add regex to list: " + row.regular_expression__c);
		}
	}

	return regexList;
}


// Listens to incoming messages that contain "goodbye"
app.message('goodbye', async ({message, say}) => {
    var threadTs;
    if (message.thread_ts) {
        threadTs = message.thread_ts;
    } else {
        threadTs = message.ts;
    }
    var string = "See ya later <https://sfdc.co/dehub|Resource Hub> <@${message.user}> :wave:".replace("${message.user}",message.user);
    // say() sends a message to the channel where the event was triggered
    await say({
        text: string,
        thread_ts: threadTs
    });
});

// Called after the 'this helped me' button is clicked
app.action('button_click_answered', async ({body, ack, say}) => {
    // Acknowledge the action
    await ack();
    handleButtonClick(body, say, BOT_RESPONSE_HELPED, BOT_RESPONSE_HELPED_EMOTICON);
});

// Called after the 'I still need help' button is clicked.
app.action('button_click_question', async ({body, ack, say }) => {
    // Acknowledge the action
    await ack();
    handleButtonClick(body, say, BOT_RESPONSE_DIDNT_HELP, BOT_RESPONSE_DIDNT_HELP_EMOTICON);
});

// Function the calls the web API to get the name of a channel from the ID of it.
async function getChannelName(channelId)
{
	let channelName = null;
	try {
	    // Call reactions.add with the built-in client
	    const channelResult = await web.conversations.info({
		channel: channelId
	    });
	    if (channelResult && channelResult.ok && channelResult.channel)
	    {
    		channelName = channelResult.channel.name
	    }
	} catch (error) {
	    console.error(error);
	}
	return channelName;
}


// Decides what text is sent as a reply to the original message based on the keyword/regex that was matched
function getResponseText(keyword, message, channelName) {
        let response = null;
	console.debug("Calling to DB. keyword: " + keyword + "Channel: " + channelName);
	const results = await pool.query('SELECT response__c FROM salesforce.Slack_Message_Response__c WHERE regular_expression__c = $1 AND channel__c = $2;', [keyword,channelName]);
	if (results.rows) {
		console.debug("Found results...");
		for (let row of results.rows) {
			response = row.response__c;
			response = response.replace("${message.user}",message.user);
			console.debug("Set response to: " + response);
			break;
		}
	}

    	return response;
}

// Function that actually sends the reply, ensures it is threaded and includes buttons to respond/interact with.
async function sendReply(message, say, phrase) {
    // Get the thread timestamp so we can reply in thread
    var threadTs;
    if (message.thread_ts) {
        threadTs = message.thread_ts;
    } else {
        threadTs = message.ts;
    }
    // Send the repsonse
    await say({
        blocks: [{
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": phrase
                }
            },
            {
                "type": "actions",
                "elements": [{
                        "type": "button",
                        "style": "primary",
                        "text": {
                            "type": "plain_text",
                            "text": ":white_check_mark: Thanks, I found my answer",
                            "emoji": true
                        },
                        "action_id": "button_click_answered"
                    },
                    {
                        "type": "button",
                        "style": "danger",
                        "text": {
                            "type": "plain_text",
                            "text": "I searched but still need help",
                            "emoji": true
                        },
                        "action_id": "button_click_question"
                    }
                ]
            }
        ],
        text: phrase,
        thread_ts: threadTs
    });
}

// Handles the button clicks to send a reply in the thread, react to the original post and remove the buttons from the first reply
async function handleButtonClick(body, say, message, reaction) {
	console.debug(body);
	var threadTs;
	if (body.message && body.message.thread_ts) {
	    threadTs = body.message.thread_ts;
	} else if (body.message) {
	    threadTs = body.message.ts;
	}
	await say({
	    text: message,
	    thread_ts: threadTs
	});
	
	try {
	    // Call reactions.add with the built-in client
	    const reactionResult = await web.reactions.add({
		channel: body.channel.id,
		name: reaction,
		timestamp: threadTs
	    });
	} catch (error) {
	    console.error(error);
	}

	try {
	    // Remove the buttons from the previous message
	    const updateResult = await web.chat.update({
		channel: body.channel.id,
		ts: body.message.ts,
		text: body.message.text,
		blocks: []
	    });
	} catch (error) {
	    console.error(error);
	}
}


// Code that runs on start-up of the app.
(async () => {
    // Start your app
    await app.start(process.env.PORT || 3000);
    buildMap();
    getAllResponses();
    console.log('⚡️ Bolt app is running!');
})();
