const { App } = require('@slack/bolt');
const { WebClient } = require('@slack/web-api');

// Initializes your app with your bot token and signing secret
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

// Initialize
const web = new WebClient(process.env.SLACK_BOT_TOKEN);

// Listens to incoming messages that contain "hello"
app.message('hello', async ({ message, say }) => {
  // say() sends a message to the channel where the event was triggered
  var threadTs;
  if(message.thread_ts) {
      threadTs = message.thread_ts; 
  }
  else{
    threadTs=message.ts;
  }
  await say({
    blocks: [
	{
		"type": "section",
		"text": {
		  "type": "mrkdwn",
		  "text": `Hey there <@${message.user}>!`
		}
	},
	{
		"type": "actions",
		"elements": [
			{
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
    text: `Hey there <@${message.user}>!`,
    thread_ts: threadTs
  });
  
});

app.action('button_click_answered', async ({ body, ack, say }) => {
  // Acknowledge the action
  await ack();
  var threadTs;
  if(body.message && body.message.thread_ts) {
      threadTs = body.message.thread_ts; 
  }
  else if (body.message) {
    threadTs=body.message.ts;
  }
  await say({text:`Glad I could help, happy selling!`,thread_ts: threadTs});
  try {
    // Call reactions.add with the built-in client
    const result = await web.reactions.add({
      channel: body.channel.id,
      name: 'white_check_mark',
      timestamp: threadTs
    });
  }
  catch (error) {
    console.error(error);
  }
  
});

app.action('button_click_question', async ({ body, ack, say }) => {
  // Acknowledge the action
  await ack();
  var threadTs;
  if(body.message && body.message.thread_ts) {
      threadTs = body.message.thread_ts; 
  }
  else if (body.message) {
    threadTs=body.message.ts;
  }
  await say({text:`No worries, an expert will check this out and help as soon as they can!`,thread_ts: threadTs});
  try {
    // Call reactions.add with the built-in client
    const result = await web.reactions.add({
      channel: body.channel.id,
      name: 'question',
      timestamp: threadTs
    });
  }
  catch (error) {
    console.error(error);
  }
});

// Listens to incoming messages that contain "goodbye"
app.message('goodbye', async ({ message, say }) => {
  var threadTs;
  if(message.thread_ts) {
      threadTs = message.thread_ts; 
  }
  else{
    threadTs=message.ts;
  }
  // say() sends a message to the channel where the event was triggered
  await say({text:`See ya later, <@${message.user}> :wave:`,thread_ts: threadTs});
});

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);

  console.log('⚡️ Bolt app is running!');
})();
