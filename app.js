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

// App Home opened - response
app.event('app_home_opened', async ({ event, client, context }) => {
  try {
    /* view.publish is the method that your app uses to push a view to the Home tab */
    const result = await client.views.publish({

      /* the user that opened your app's app home */
      user_id: event.user,

      /* the view object that appears in the app home*/
      view: {
        type: 'home',
        callback_id: 'home_view',

        /* body of the view */
        "blocks": [
		{
			"type": "header",
			"text": {
				"type": "plain_text",
				"text": "Hi there :wave:  \nGreat to see you here!",
				"emoji": true
			}
		},
		{
			"type": "divider"
		},
		{
			"type": "section",
			"text": {
				"type": "mrkdwn",
				"text": " This App that helps Sales teams get answers faster, by responding to any questions asked in a channel to point the user to resources."
			}
		},
		{
			"type": "divider"
		},
		{
			"type": "section",
			"text": {
				"type": "mrkdwn",
				"text": "These are just a few things which you will be able to do:\n\n• Starts a thread for each response \n • Use Regular Expressions to match the input and respond as appropriate \n • React to the original post based on whether the response answered the question or not."
			}
		},
		{
			"type": "divider"
		},
		{
			"type": "section",
			"text": {
				"type": "mrkdwn",
				"text": "But before you can do all these amazing things, responses will need to be setup by those that manage the Slack channel"
			}
		},
		{
			"type": "divider"
		},
		{
			"type": "section",
			"text": {
				"type": "mrkdwn",
				"text": "Learn more about this App and how to use it by watching this video"
			},
			"accessory": {
				"type": "button",
				"text": {
					"type": "plain_text",
					"text": ":movie_camera: Learn More",
					"emoji": true
				},
				"value": "click_me_123",
				"url": "https://drive.google.com/file/d/103wcfG4x49zLoHlGaLqmdRZM6EDJ0uvJ/view?usp=sharing",
				"action_id": "button-action"
			}
		},
		{
			"type": "divider"
		},
		{
			"type": "section",
			"text": {
				"type": "mrkdwn",
				"text": "Once you've watched the video, start with the Spreadsheet"
			},
			"accessory": {
				"type": "button",
				"text": {
					"type": "plain_text",
					"text": ":spreadsheet: Open Spreadsheet",
					"emoji": true
				},
				"value": "click_me_123",
				"url": "https://docs.google.com/spreadsheets/d/1MD-XbSI8uJzEmr7-wORY1RjdpR-5pdRBrDFbQA7b18Q/edit?usp=sharing",
				"action_id": "button-action"
			}
		},
		{
			"type": "divider"
		}
	]
      }
    });
  }
  catch (error) {
    console.error(error);
  }
});

// Constants for the responses when buttons are clicked.
const BOT_RESPONSE_HELPED = "Glad I could help, happy selling!";
const BOT_RESPONSE_HELPED_EMOTICON = "white_check_mark";
const BOT_RESPONSE_DIDNT_HELP = "No worries, an expert will check this out and help as soon as they can.";
const BOT_RESPONSE_DIDNT_HELP_EMOTICON = "question";
const BOT_RESPONSE_HELPED_BUTTON = ":white_check_mark: Thanks, I found my answer";
const BOT_RESPONSE_DIDNT_HELP_BUTTON = "I searched but still need help";

// Listens to all incoming messages that contain a ? in them - this is what is fired when a Slack message is sent in a channel this app is in.
app.message(async ({message, say}) => {
    // We don't care about messages sent within a thread, only reply to top level messages. So if the message has a thread_ts then ignore it
    if (!message.thread_ts && !message.hidden) {
	let channelName = await getChannelName(message.channel);
	console.debug("Handling message for channel: " + channelName);
	// Get the list of things to check for for this channel
	let responseList = await getSlackResponsesForChannel(channelName);
	    // Get the default response in case we don't match any of the things to check for above
	    let response, messageId = null;
	    let successButtonLabel = BOT_RESPONSE_HELPED_BUTTON;
	    let failButtonLabel = BOT_RESPONSE_DIDNT_HELP_BUTTON;
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
			successButtonLabel = slackResponse.success_label ? slackResponse.success_label : BOT_RESPONSE_HELPED_BUTTON;
			failButtonLabel = slackResponse.fail_label ? slackResponse.fail_label : BOT_RESPONSE_DIDNT_HELP_BUTTON;
			break; 
		}
	    }
	    // If we didn't set a response above then get the default if there is one
	    if (!response) {
		let slackResponse = await getDefaultMessage(message,channelName);
		if (slackResponse) {
			response = slackResponse.response;
			showButtons = slackResponse.showButtons;
			messageId = slackResponse.id;
			successButtonLabel = slackResponse.successLabel ? slackResponse.successLabel : BOT_RESPONSE_HELPED_BUTTON;
			failButtonLabel = slackResponse.failLabel ? slackResponse.failLabel : BOT_RESPONSE_DIDNT_HELP_BUTTON;
	    	}
	    }
	    //console.debug("showButtons:" + showButtons);
	    if (response) {
		sendReply(message, say, response, showButtons, successButtonLabel, failButtonLabel);
	    	incrementSentCount(messageId);
	    }
	    logMessage(message,messageId);
    }
});

async function logMessage(message, messageId) {
	let messageString = message.text;
	// prevent an error exceeding total length of message just in case
	if (message.text.length > 2000)
	{
		messageString = message.text.substring(0,1997) + '...';
	}
	const results = await pool.query('INSERT INTO salesforce.slack_message_info(response_id, thread_ts, slack_message) VALUES ($1, $2, $3);', [messageId, message.ts, messageString]);
}

// Get the default message as the fallback for a channel.
async function getDefaultMessage(message, channelName)
{
	let defaultMessage, returnObj = null;
	//console.debug("Calling to DB. Channel: " + channelName);
	const results = await pool.query('SELECT id, response__c as response, show_buttons__c as show_buttons, success_button_label__c as success_label, fail_button_label__c as fail_label FROM salesforce.Slack_Message_Response__c WHERE is_channel_default__c = true AND Is_Active__c = true AND channel__c = $1;', [channelName]);
	if (results.rows) {
		console.debug("Found results for default message for channel: " + channelName);
		for (let row of results.rows) {
			defaultMessage = row.response;
			defaultMessage = defaultMessage.replace("${message.user}",message.user);
			console.debug("Set defaultMessage to: " + defaultMessage);
			returnObj = { id: row.id, response: defaultMessage, showButtons: row.show_buttons, successLabel: row.success_label, failLabel: row.fail_label };
			break;
		}
	}
	// Return an inline object with the response and the show/hide buttons boolean value
	return returnObj; 
}




// Finds all the regular expressions we want to check the message for this channel
async function getSlackResponsesForChannel(channelName)
{
	// Go get the list of regular expressions for this slack channel
	let responseList = null;
	//console.debug("Calling to DB. Channel: " + channelName);
	const results = await pool.query('SELECT id, regular_expression__c as regex, response__c as response, show_buttons__c as show_buttons, success_button_label__c as success_label, fail_button_label__c as fail_label FROM salesforce.Slack_Message_Response__c WHERE regular_expression__c IS NOT NULL AND Is_Active__c = true AND channel__c = $1;', [channelName]);
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
async function sendReply(message, say, phrase, showButtons, successButtonLabel, failButtonLabel) {
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
				    "text": successButtonLabel,
				    "emoji": true
				},
				"action_id": "button_click_answered"
			    },
			    {
				"type": "button",
				"style": "danger",
				"text": {
				    "type": "plain_text",
				    "text": failButtonLabel,
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
		const results = await pool.query('UPDATE salesforce.Slack_Message_Response__c SET success__c = success__c + 1 WHERE id = $1;', [messageId]);
	}
	
}

// Function that increments the count for the number of times the fail button was clicked for this message
async function incrementFailCount(messageId) {
	if (messageId)
	{
		const results = await pool.query('UPDATE salesforce.Slack_Message_Response__c SET fail__c = fail__c + 1 WHERE id = $1;', [messageId]);
	}
	
}

// Called after the 'this helped me' button is clicked
app.action('button_click_answered', async ({body, ack, say}) => {
    // Acknowledge the action
    await ack();
    handleButtonClick(body, say, true);
});

// Called after the 'I still need help' button is clicked.
app.action('button_click_question', async ({body, ack, say }) => {
    // Acknowledge the action
    await ack();
    handleButtonClick(body, say, false);
});

// Handles the button clicks to send a reply in the thread, react to the original post and remove the buttons from the first reply
async function handleButtonClick(body, say, success) {
	//console.debug(body);
	let threadTs, messageId = null;
	if (body.message && body.message.thread_ts) {
	    threadTs = body.message.thread_ts;
	} else if (body.message) {
	    threadTs = body.message.ts;
	}
	// Go find the original Message that was sent as the reply for this thread
	messageId = await getOriginalMessageId(threadTs);
	
	// Use that message ID to get the response that we should send back to the user after this button click
	let responseObj = await getButtonResponse(success, messageId);
	
	// Send the response in thread
	await say({
	    text: responseObj.text,
	    thread_ts: threadTs
	});
	
	// Add the configured reaction to the original message
	try {
	    // Call reactions.add with the built-in client
	    const reactionResult = await web.reactions.add({
		channel: body.channel.id,
		name: responseObj.icon,
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

// Returns what to response to the button click with based on the button and the original response
async function getButtonResponse(success, messageId)
{
	let responseObj = null; 
	if (success)
	{
		// Update the counter in the DB for this message ID
		incrementSuccessCount(messageId);
		// Set default in case values aren't set later
		responseObj = { text: BOT_RESPONSE_HELPED, icon: BOT_RESPONSE_HELPED_EMOTICON};
	}
	else
	{
		
		// Update the counter in the DB for this message ID
		incrementFailCount(messageId);
		// Set default in case values aren't set later
		responseObj = { text: BOT_RESPONSE_DIDNT_HELP, icon: BOT_RESPONSE_DIDNT_HELP_EMOTICON};;
	}
	
	// If we passed a message, go get it's values from the DB
	if (messageId)
	{
		// Go get response and reaction for the message that was sent before
		const results = await pool.query('SELECT Success_Response_Reaction__c as success_reaction, Success_Response_Message__c as success_message, Fail_Response_Reaction__c as fail_reaction, Fail_Response_Message__c as fail_message FROM salesforce.Slack_Message_Response__c WHERE Id = $1;', [messageId]);
		if (results.rows) {
			let slackResponse = results.rows[0];
			if (slackResponse && success)
			{
				// Success responses
				responseObj.text = slackResponse.success_message;
				responseObj.icon = slackResponse.success_reaction;
			}
			else if (slackResponse)
			{
				// Failed responses
				responseObj.text = slackResponse.fail_message;
				responseObj.icon = slackResponse.fail_reaction;
			}
			
		}

	}
	
	return responseObj;
}

// Goes and finds the original messageID that was sent as a reply in this thread
async function getOriginalMessageId(threadTs) {
	// Go get the list of regular expressions for this slack channel
	let messageId = null;
	//console.debug("Calling to DB. Channel: " + channelName);
	const results = await pool.query('SELECT response_id FROM salesforce.slack_message_info WHERE thread_ts = $1;', [threadTs]);
	if (results.rows && results.rows[0]) {
		messageId = results.rows[0].response_id;
	}

	return messageId;
}


// Code that runs on start-up of the app.
(async () => {
    // Start your app
    await app.start(process.env.PORT || 3000);
    console.log('⚡️ Bolt app is running!');
})();
