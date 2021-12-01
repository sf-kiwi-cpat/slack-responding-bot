const {App} = require('@slack/bolt');
const {WebClient} = require('@slack/web-api');
const { Pool } = require('pg');

// Connect to the Heroku Postgres database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Callback on any errors when querying the Database
pool.on('error', (err, client) => {
    console.error('Error:', err);
});

// Initialize the web client so we can call the API later
const web = new WebClient(process.env.SLACK_BOT_TOKEN);

// Initializes your app with your bot token and signing secret
const app = new App({
	token: process.env.SLACK_BOT_TOKEN,
	signingSecret: process.env.SLACK_SIGNING_SECRET,
	// Socket Mode doesn't listen on a port, but in case you want your app to respond to OAuth,
	// you still need to listen on some port!
	port: process.env.PORT || 3000
});

// Constants for the responses when buttons are clicked.
const BOT_RESPONSE_HELPED = "Glad I could help, happy selling!";
const BOT_RESPONSE_HELPED_EMOTICON = "white_check_mark";
const BOT_RESPONSE_DIDNT_HELP = "No worries, an expert will check this out and help as soon as they can.";
const BOT_RESPONSE_DIDNT_HELP_EMOTICON = "question";
const BOT_RESPONSE_HELPED_BUTTON = ":white_check_mark: Thanks, I found my answer";
const BOT_RESPONSE_DIDNT_HELP_BUTTON = "I searched but still need help";

// Listens to all incoming messages that contain a ? in them - this is what is fired when a Slack message is sent in a channel this app is in.
app.message('\?', async ({message, say}) => {
    // We don't care about messages sent within a thread, only reply to top level messages. So if the message has a thread_ts then ignore it
    if (!message.thread_ts && !message.hidden) {
	let channelName = await getChannelName(message.channel);
	console.debug("Handling message for channel: " + channelName);
	// Get the list of things to check for for this channel
	let responseList = await getSlackResponsesForChannel(channelName);
	    // Get the default response in case we don't match any of the things to check for above
	    let response, messageId = null;
	    let showButtons = true; // determines if the buttons are shown after the message or not
	    // Now check each regular expression and see if it is in the message sent in
	    for (let slackResponse of responseList) {
		//console.debug("check regex:" + slackResponse.regex + " \nWith: " + message.text);
	    	if (message.text.match(new RegExp(slackResponse.regex, "i"))) {
			console.debug("matched regex:" + slackResponse.regex);
			// Use the response value from the original DB search, but replace the username with the actual value
			response = slackResponse.response.replace("${message.user}",message.user);
			showButtons = slackResponse.show_buttons;
			messageId = slackResponse.id;
			break; 
		}
	    }
	    // If we didn't set a response above then get the default.
	    if (!response) {
		    let slackResponse = await getDefaultMessage(message,channelName);
		    response = slackResponse.response;
		    showButtons = slackResponse.showButtons;
		    messageId = slackResponse.id;
	    }
	    //console.debug("showButtons:" + showButtons);
	    sendReply(message, say, response, showButtons);
	    incrementSentCount(messageId);
    }
});


// Get the default message as the fallback for a channel.
async function getDefaultMessage(message, channelName)
{
	let defaultMessage = `Thanks for posting <@${message.user}> - I'm just creating a thread for you to keep the channel tidy.`;
	let showButtons = false; // By default don't add buttons
	let id = null;
	//console.debug("Calling to DB. Channel: " + channelName);
	const results = await pool.query('SELECT id, response__c as response, show_buttons__c as show_buttons FROM salesforce.Slack_Message_Response__c WHERE is_channel_default__c = true AND Is_Active__c = true AND channel__c = $1;', [channelName]);
	if (results.rows) {
		console.debug("Found results for default message for channel: " + channelName);
		for (let row of results.rows) {
			id = row.id;
			defaultMessage = row.response;
			defaultMessage = defaultMessage.replace("${message.user}",message.user);
			console.debug("Set defaultMessage to: " + defaultMessage);
			showButtons = row.show_buttons;
			break;
		}
	}
	// Return an inline object with the response and the show/hide buttons boolean value
	return { id: id, response: defaultMessage, showButtons: showButtons };
}




// Finds all the regular expressions we want to check the message for this channel
async function getSlackResponsesForChannel(channelName)
{
	// Go get the list of regular expressions for this slack channel
	let responseList = null;
	//console.debug("Calling to DB. Channel: " + channelName);
	const results = await pool.query('SELECT id, regular_expression__c as regex, response__c as response, show_buttons__c as show_buttons FROM salesforce.Slack_Message_Response__c WHERE regular_expression__c IS NOT NULL AND Is_Active__c = true AND channel__c = $1;', [channelName]);
	if (results.rows) {
		console.debug("Found results for slack responses for channel: "+ channelName);
		responseList = results.rows;
	}

	return responseList;
}

// Function the calls the web API to get the name of a channel from the ID of it.
async function getChannelName(channelId)
{
	let channelName = null;
	try {
	    // Call conversations.info with the built-in client to get the name of the channel based on the ID
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

// Function that actually sends the reply, ensures it is threaded and includes buttons to respond/interact with.
async function sendReply(message, say, phrase, showButtons) {
    // Get the thread timestamp so we can reply in thread
    var threadTs;
    if (message.thread_ts) {
        threadTs = message.thread_ts;
    } else {
        threadTs = message.ts;
    }
    // Send the response
    if (showButtons)
    {
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
				    "text": BOT_RESPONSE_HELPED_BUTTON,
				    "emoji": true
				},
				"action_id": "button_click_answered"
			    },
			    {
				"type": "button",
				"style": "danger",
				"text": {
				    "type": "plain_text",
				    "text": BOT_RESPONSE_DIDNT_HELP_BUTTON,
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
    else {
	 await say({
		blocks: [{
			"type": "section",
			"text": {
			    "type": "mrkdwn",
			    "text": phrase
			}
		    }
		],
		text: phrase,
		thread_ts: threadTs
	    });    
    }
}

// Function that increments the count for the number of times a message has been sent in Slack
async function incrementSentCount(messageId) {
	console.debug("Incrementing sent count for message ID: " + messageId);
	if (messageId)
	{
		const results = await pool.query('UPDATE salesforce.Slack_Message_Response__c SET sent__c = sent__c + 1 WHERE id = $1;', [messageId]);
	}
}

// Function that increments the count for the number of times the success button was clicked for this message
async function incrementSuccessCount(messageId) {
	if (messageId)
	{
		//const results = await pool.query('UPDATE salesforce.Slack_Message_Response__c SET success__c = success__c + 1 WHERE id = $1;', [messageId]);
	}
	
}

// Function that increments the count for the number of times the fail button was clicked for this message
async function incrementFailCount(messageId) {
	if (messageId)
	{
		//const results = await pool.query('UPDATE salesforce.Slack_Message_Response__c SET fail__c = fail__c + 1 WHERE id = $1;', [messageId]);
	}
	
}

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


// Handles the button clicks to send a reply in the thread, react to the original post and remove the buttons from the first reply
async function handleButtonClick(body, say, message, reaction) {
	//console.debug(body);
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
    console.log('⚡️ Bolt app is running!');
})();
