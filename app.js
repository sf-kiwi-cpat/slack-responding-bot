const {
    App
} = require('@slack/bolt');
const {
    WebClient
} = require('@slack/web-api');

// Initializes your app with your bot token and signing secret
const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET
});

const DEFAULT_MESSAGE = "Thanks for posting <@${message.user}>! - please check out the Resource Hub (https://sfdc.co/dehub) for a quick answer. Select the buttons below once you've checked the hub and this channel for your answer.";

// Initialize
const web = new WebClient(process.env.SLACK_BOT_TOKEN);

// Listens to incoming messages that contain "hello"
app.message('hello', async ({
    message,
    say
}) => {
    let phrase = getResponseText('hello');
    sendReply(message, say, phrase);
});

// Listens to incoming messages that contain "goodbye"
app.message('WhatsApp', async ({
    message,
    say
}) => {
    let phrase = getResponseText('WhatsApp');
    sendReply(message, say, phrase);
});

// Listens to incoming messages that contain "goodbye"
app.message('goodbye', async ({
    message,
    say
}) => {
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

app.action('button_click_answered', async ({
    body,
    ack,
    say
}) => {
    // Acknowledge the action
    await ack();
    handleButtonClick(body, say, "Glad I could help, happy selling!", "white_check_mark");
});

app.action('button_click_question', async ({
    body,
    ack,
    say
}) => {
    // Acknowledge the action
    await ack();
    handleButtonClick(body, say, "No worries, an expert will check this out and help as soon as they can.", "question");
});



(async () => {
    // Start your app
    await app.start(process.env.PORT || 3000);
    console.log('⚡️ Bolt app is running!');
})();


function getResponseText(keyword) {
    let response = "";
    switch (keyword) {
        case "WhatsApp":
            response = "WhatsApp response";
            break;
        default:
            response = DEFAULT_MESSAGE;
            break;
    }

    return response;
}


async function sendReply(message, say, phrase) {
    // https://cloud.google.com/functions/docs/env-var#nodejs_10_and_subsequent_runtimes
    var threadTs;
    if (message.thread_ts) {
        threadTs = message.thread_ts;
    } else {
        threadTs = message.ts;
    }
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
                            "text": ":question:I still need help",
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
		blocks: []
	    });
	} catch (error) {
	    console.error(error);
	}
}
