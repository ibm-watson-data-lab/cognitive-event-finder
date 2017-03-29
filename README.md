# Cognitive Event Finder

Cognitive Event Finder is a web-based chatbot for finding events/sessions at conferences.
It uses Watson Conversation to manage the chat, Cloudant for retrieving events,
and Mapbox for mapping and finding popular events. 

You can find a working example @ https://cognitive-event-finder.mybluemix.net/

### Quick Reference

The following environment variables are required to run the application:

```
MAPBOX_ACCESS_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CONVERSATION_USERNAME=xxxxxxx-xxxx-xxxx-xxxxx-xxxxxxxxxxxxx
CONVERSATION_PASSWORD=xxxxxxxxxxxx
CONVERSATION_WORKSPACE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLOUDANT_URL=https://xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx-bluemix.cloudant.com
CLOUDANT_DB_NAME=xxxxxxxxxx
SUGGESTED_SEARCH_TERMS=ibm,map,cognitive,machine learning,data science,analytics
SEARCH_RESULT_COUNT=5
SEARCH_TIME_HOURS=8
MAX_SEARCH_TIME_HOURS=248
SEARCH_START_TIME=1489154400
SEARCH_START_TIME_OFFSET_HOURS=0
```

We will show you how to configure the necessary services and retrieve these values in the instructions below:

### Prerequisites

The following prerequisites are required to run the application.

1. A [Bluemix](https://www.ibm.com/cloud-computing/bluemix/) account.
2. A [Watson Conversation](https://www.ibm.com/watson/developercloud/conversation.html) service provisioned in your Bluemix account.
3. A [Cloudant](http://cloudant.com/) service provisioned in your Bluemix account.
4. A [Mapbox](https://www.mapbox.com/) access token.

To run locally you will need Node.js 4.3.2 or greater.

To push your application to Bluemix from your local development environment you will need the [Bluemix CLI and Dev Tools](https://console.ng.bluemix.net/docs/starters/install_cli.html).

### Local Development Environment

We'll start by getting your local development environment set up. If you haven't already installed Node.js
you can install it by following the instructions [here](https://nodejs.org/en/).

From the command-line cd into the cognitive-event-finder directory:

```
git clone https://github.com/ibm-cds-labs/cognitive-event-finder
cd cognitive-event-finder
```
 
Install dependencies:

```
npm install
```

Copy the .env.template file included in the project to .env. This file will contain the environment variable definitions:

```
cp .env.template .env
```

### Mapbox

The application requires that you have a free Mapbox account and API token.

To sign up for a Mapbox account go to https://www.mapbox.com/signup/.
 
To create an API token go to https://www.mapbox.com/studio/account/tokens/.

Once you have your API token copy it to your .env file:

    ```
    MAPBOX_ACCESS_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    ```

### Bluemix

If you do not already have a Bluemix account [click here](https://console.ng.bluemix.net/registration/) to sign up.

Login to your Bluemix account.

### Watson Conversation

First, we'll walk you through provisioning a Watson Conversation service in your Bluemix account:


1. From your Bluemix Applications or Services Dashboard click the **Create Service** button.

    ![Bluemix](screenshots/bluemix1.png?rev=3&raw=true)

2. In the IBM Bluemix Catalog search for **Watson Conversation**.
3. Select the **Conversation** service.

    ![Watson Conversation](screenshots/conversation1.png?rev=1&raw=true)
    
4. Click the **Create** button on the Conversation detail page.
5. On your newly created Conversation service page click the **Service Credentials** tab.

    ![Watson Conversation](screenshots/conversation2.png?rev=1&raw=true)

6. Find your newly created Credentials and click **View Credentials**

    ![Watson Conversation](screenshots/conversation3.png?rev=1&raw=true)

7. Copy the username and password into your .env file:

    ```
    CONVERSATION_USERNAME=xxxxxxx-xxxx-xxxx-xxxxx-xxxxxxxxxxxxx
    CONVERSATION_PASSWORD=xxxxxxxxxxxx
    ```

Next, let's launch the Watson Conversation tool and import our conversation workspace.

1. Go back to the **Manage** tab.
2. Click the **Launch tool** button.

    ![Watson Conversation](screenshots/conversation4.png?rev=1&raw=true)

3. Log in to Watson Conversation with your Bluemix credentials if prompted to do so.
4. On the **Create workspace** page click the **Import** button.

    ![Watson Conversation](screenshots/conversation5.png?rev=1&raw=true)
    
5. Choose the workspace.json file in the application directory (*cognitive-event-finder/workspace.json*).
6. Click the **Import** button.

    ![Watson Conversation](screenshots/conversation6.png?rev=1&raw=true)

7. Under Workspaces you should now see the Cognitive Event Finder.
8. Click the menu button (3 vertical dots) and click **View Details**

    ![Watson Conversation](screenshots/conversation7.png?rev=1&raw=true)
    
9. Copy the Workspace ID and paste it into your .env file:

    ```
    CONVERSATION_WORKSPACE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    ```

### Cloudant

We're almost there! Next, we'll provision an instance of Cloudant in our Bluemix account. After this step we will be able to run our bot locally.

1. From your Bluemix Applications or Services Dashboard click the **Create Service** button.
2. In the IBM Bluemix Catalog search for **Cloudant**.
3. Select the **Cloudant NoSQL DB** service.

    ![Cloudant](screenshots/cloudant1.png?rev=1&raw=true)

4. Click the **Create** button on the Cloudant detail page.
5. On your newly created Cloudant service page click the **Service Credentials** tab.
6. Find your newly created Credentials and click **View Credentials**
7. Copy the username, password, and the url into your .env file:

    ```
    CLOUDANT_USERNAME=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx-bluemix
    CLOUDANT_PASSWORD=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    CLOUDANT_URL=https://xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx-bluemix.cloudant.com
    ```
Next, create the following databases in Cloudant:

1. `sxswsessions`
2. `sxswusers`
3. `sxswlogs`

Note: You can specify alternative names for these databases. If you do so be sure to update your .env file.
  
Finally, we need to populate our `sxswsessions` database. We've made the list of SXSW events available from a public Cloudant database @ https://opendata.cloudant.com/sxswsessions.

You can use the replication feature in Cloudant to copy these events into your Cloudant database.

1. In Cloudant select **Replication**.
2. Click the **New Replication** button:

    ![Cloudant](screenshots/cloudant2.png?rev=2&raw=true)

3. Configure the replication task as follows:

    ![Cloudant](screenshots/cloudant3.png?rev=1&raw=true)

### Run Locally

We're now ready to test our bot. From the command-line run the following command:

```
npm start
```

If all is well you should see output similar to the following:

```
Getting event database...
Server starting on http://localhost:6018
Getting user database...
Getting dialog database...
```

To interact with the bot go to the URL printed in the log.

## License

Licensed under the [Apache License, Version 2.0](LICENSE.txt).

