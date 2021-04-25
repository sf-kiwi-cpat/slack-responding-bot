const {App} = require('@slack/bolt');
const {WebClient} = require('@slack/web-api');

// Initializes your app with your bot token and signing secret
const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET
});

const CHANNEL_REGEX_MAP = new Map();

function buildMap() {
    CHANNEL_REGEX_MAP.set('automated-responses', ["WhatsApp", "WeChat", "roadmap"]);
}

function getDefaultMessage(message)
{
    // Can't use a static variable/constant as it needs to evaluate the user at runtime.
    return `Thanks for posting <@${message.user}> - please check out the Resource Hub (https://sfdc.co/dehub) for a quick answer. \n\nSelect the buttons below once you've searched the hub and this channel for your answer.`;
}

// Initialize
const web = new WebClient(process.env.SLACK_BOT_TOKEN);

// Listens to all incoming messages
app.message(async ({message, say}) => {
    console.debug(message);
    // We don't care about messages sent within a thread, only reply to top level messages. So if the message has a thread_ts then ignore it
    if (!message.thread_ts) {
	    let channelName = await getChannelName(message.channel);
	    console.debug("channel:" + channelName);
	    let regexList = getRegexForChannel(channelName);
	    let response = getDefaultMessage(message);
	    for (regex in regexList) {
		console.debug("check regex:" + regexList[regex] + " \nWith: " + message.text);
	    	if (message.text.match(regex)) {
			console.debug("matched regex:" + regexList[regex]);
			response = getResponseText(regexList[regex], channelName);
			break; 
		}
	    }
	    sendReply(message, say, response);    
    }
});

function getRegexForChannel(channelName)
{
	if (CHANNEL_REGEX_MAP.has(channelName)) {
		return CHANNEL_REGEX_MAP.get(channelName);
	}
	return null;
}


// Listens to incoming messages that contain "goodbye"
app.message('goodbye', async ({message, say}) => {
    var threadTs;
    if (message.thread_ts) {
        threadTs = message.thread_ts;
    } else {
        threadTs = message.ts;
    }
    // say() sends a message to the channel where the event was triggered
    await say({
        text: `See ya later, <@${message.user}> :wave:`,
        thread_ts: threadTs
    });
});

app.action('button_click_answered', async ({body, ack, say}) => {
    // Acknowledge the action
    await ack();
    handleButtonClick(body, say, "Glad I could help, happy selling!", "white_check_mark");
});

app.action('button_click_question', async ({body, ack, say }) => {
    // Acknowledge the action
    await ack();
    handleButtonClick(body, say, "No worries, an expert will check this out and help as soon as they can.", "question");
});


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
function getResponseText(keyword, channelName) {
    let response = null;
    switch (keyword) {
        case "WhatsApp":
            response = "WhatsApp response";
            break;
        case "WeChat":
	    response = "WeChat response"	    
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



(async () => {
    // Start your app
    await app.start(process.env.PORT || 3000);
    buildMap();
    console.log('⚡️ Bolt app is running!');
})();
