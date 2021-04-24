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
        },
        "accessory": {
          "type": "button",
          "style": "primary",
          "text": {
            "type": "plain_text",
            "text": ":white_check_mark:"
          },
          "action_id": "button_click_answered"
        },
        "accessory": {
          "type": "button",
          "style": "danger",
          "text": {
            "type": "plain_text",
            "text": ":question:"
          },
          "action_id": "button_click_question"
        }
      }
    ],
    text: `Hey there <@${message.user}>!`,
    thread_ts: threadTs
  });
  
  console.debug(app.token);
  console.debug(message.channel);
  console.debug(threadTs);
  
  try {
    // Call reactions.add with the built-in client
    const result = await web.reactions.add({
//      token: process.env.BOT_TOKEN,
      channel: message.channel,
      name: 'thumbsup',
      timestamp: threadTs
    });
  }
  catch (error) {
    console.error(error);
  }
});

app.action('button_click_answered', async ({ body, ack, say }) => {
  // Acknowledge the action
  await ack();
  await say(`<@${body.user.id}> clicked the :white_check_mark: button`);
});

app.action('button_click_question', async ({ body, ack, say }) => {
  // Acknowledge the action
  await ack();
  await say(`<@${body.user.id}> clicked the :question: button`);
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
