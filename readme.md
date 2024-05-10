```json
{
    "version": "v1",
    "rawPath": "/example",
    "body": "Hello FC!",
    "isBase64Encoded": false,
    "headers": {
        "header1": "value1",
        "header2": "value1,value2"
    },
    "queryParameters": {
        "parameter1": "value1",
        "parameter2": "value1,value2"
    },
    "requestContext": {
        "accountId": "123456*********",
        "domainName": "<http-trigger-id>.<region-id>.fcapp.run",
        "domainPrefix": "<http-trigger-id>",
        "http": {
            "method": "GET",
            "path": "/example",
            "protocol": "HTTP/1.1",
            "sourceIp": "11.11.11.**",
            "userAgent": "PostmanRuntime/7.32.3"
        },
        "requestId": "1-64f6cd87-*************",
        "time": "2023-09-05T06:41:11Z",
        "timeEpoch": "1693896071895"
    }
}
```