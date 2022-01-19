# Selling Assistant App for Slack

> An app to help Account Executives get answers fast, and help Solution Engineers spend their time wisely.

## Overview

This app listens to Slack messages sent within public Slack channels it is added to, and responds in thread as appropriate. To determine the response to send, it looks up previously configured 'Slack Message Responses' for that channel, runs the associated regular expression for that response against the message sent, and if it matches, responds accordingly.

The 'Slack Message Responses' are configured as a Custom Object in a Salesforce Org - these are accessed by the app via a Postgres database, which is updated via Heroku Connect.

## How it works

### Message Responses created

The first step for using this app requires that each channel it is added to has a set of responses that it may give based on the question. The responses are captured in a Salesforce Org, with a new Custom Object called 'Slack_Message_Response__c'. 
This object has these fields:
- Name
- Channel
- Regular Expression
- Response
- Is Channel Default
- Order
- Is Active
- Show Buttons

Each channel that this app is added to should have at least a default response. 

### Slack Message Sent

Once a message is sent in a channel the app is a part of, an event is fired and caught by the App. The app will only process the event if it contains a question mark (?) and it is a top level message (i.e. is to the channel, and not part of a thread). 

Once it has confirmed it will process it, the app then looks up the channel to find the name (only the ID is part of the event message), before then querying the database for all configured responses for that channel, ordered by the 'order' field (lowest number has the highest priority (i.e. starts at 1)).

One it has the list of responses, it will run a regular expression check against the message that was sent - if it matches, it will respond with the associated message. If none of the regular expressions are matched for this channel, it will use the default response back to the original poster.


### Slack Message Response

The response that sent will also include 2 buttons (if 'showButtons' is true) - one that the user should press if the response answered their question, and the other if it didn't. Once those buttons are clicked, the App will send a reaction to the top level post - either a check mark ✅ to indicate it is answered, or a question mark❓ to indicate help is still required. This is to help experts who monitor the selling channels to know if an answer is still required for the question that was asked, so they can spend more time answering difficult questions, rather than pointing to content that already exists.

The app will also response with a message in the thread as appropriate - either saying it was glad that it could help, or that an expert will take a look when they have a moment.

### Adding a new Channel

To add a new channel, you will first need to add responses to the Salesforce Org. Please review [this video][3] which will give you instructions on how to start using the Selling Assistant. It will point you to [this Spreadsheet][4] - you can then let Craig Paterson know and he can give you access to the org.

Once they are in there, you can add the bot to your channel through Slack, and it should start responding to any questions posted. 






#### Notes
This is a Slack app built with the [Bolt for JavaScript framework][1] that is deployed to the [Heroku platform][2]. 
To support private channels, the App needs the 'groups:history' and 'groups:read' scopes to be added, and also needs to subscribe to the 'message.groups' Event.

[1]: https://slack.dev/bolt-js/
[2]: https://heroku.com/
[3]: https://drive.google.com/file/d/103wcfG4x49zLoHlGaLqmdRZM6EDJ0uvJ/view?usp=sharing
[4]: https://docs.google.com/spreadsheets/d/1MD-XbSI8uJzEmr7-wORY1RjdpR-5pdRBrDFbQA7b18Q/edit?usp=sharing
