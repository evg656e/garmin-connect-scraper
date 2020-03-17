# garmin-connect-scraper

Incremental [Puppeteer](https://github.com/puppeteer/puppeteer) based Garmin Connect™ scraper.

## Usage

Minimal usage:
```
garmin-connect-scraper --username=login@mail.com --password=secret
```

This will download all your activities as ```activities.json``` file into current folder.

To change the default download path or to download additional data, use config files (see [configuration](#Configuration) section below):
```
garmin-connect-scraper --config=myconfig.json --username=login@mail.com --password=secret
```

Usage example: https://github.com/evg656e/garmin-routines-updater

## Configuration

```jsonc
{
    // some general options
    "general": {
        // delay (in milliseconds, 5000 default) to download data 
        // the smaller the number, the faster the data will be downloaded, but you will probably get a timeout penalty from garmin site (reduce on your own risk)
        "requestDelay": 3000,
        // default pick policy (possible values are "notNull" or "all")
        // by default all properties are picked, changing to "notNull" will skip properties with null values 
        "defaultPickPolicy": "notNull",
        // specifies base directory that can be used in file paths lookups
        // the lookup syntax is {varName}, some default lookup variables are available:
        // cwd - current working directory (default)
        // homeDir - system home directory
        // currentDate - date part of current datetime in ISO format
        // currentTime - time part current datetime in ISO format
        "baseDir": "{homeDir}/sports"
    },
    // you can save your credentials here not to pass it through CLI every time (not a good idea though)
    "credentials": {
        "username": "login@mail.com",
        "password": "secret"
    },
    // data retrieval section
    "activities": {
        "search": {
            // search parameters as they used on https://connect.garmin.com/modern/activities page
            // for example, to retrieve all swimming activities, specify:
            "parameters": {
                "activityType": "swimming",
                "activitySubType": "lap_swimming"
            },
            // limits the number of activities retrieved (unlimited by default, so that all activities will be retrieved)
            "limit": 100,
            // path to file where to save activities
            // this file will be used on the next program invocations to retrieve only new activities
            // default lookup variables (сwd, homeDir or baseDir) are available
            "path": "{baseDir}/lap_swimming/index.json",
            // explicitly sets the set of properties to retrieve from activities
            // it is possible to rename properties using syntax "name as newName"
            // it is possible to use nested properties using syntax "parent.childName as newName" (when using nested properties renaming is mandatory)
            // example (only 4 data fields will be picked for each activity):
            "pick": [
                "activityId",
                "activityName",
                "startTimeLocal as startTime",
                "activityType.typeKey as activityTypeKey"
            ]
        },
        // additional data retrievals
        // you can specify additional data to be retrieved per activity
        // for example, by this, splits and activity details will be downloaded for each retrieved activity from the "search" section
        "fetch": [
            {
                // data url to be retrieved
                // you can use activity's properties as lookups
                "url": "https://connect.garmin.com/modern/proxy/activity-service/activity/{activityId}/splits",
                // path to file where to save data
                // you can use default variables (e.g. cwd, homeDir or baseDir) and current activity's properties (e.g. activityId) as lookups in this path
                "path": "{baseDir}/lap_swimming/splits/{activityId}.json"
                // "pick" property as mentioned above is available here
            },
            {
                "url": "https://connect.garmin.com/modern/proxy/activity-service/activity/{activityId}",
                "path": "{baseDir}/lap_swimming/activity/{activityId}.json"
            }
        ]
    }
}
```

The configuration file must be valid JSON file, so be sure to remove the comments, if you use this snippet.

## Links

Some other similar projects:
  * https://github.com/fsrc/agcs/blob/master/lib/garmin-connect.ls
  * https://github.com/pe-st/garmin-connect-export/blob/develop/gcexport.py
