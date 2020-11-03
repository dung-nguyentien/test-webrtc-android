var client = new PeerManager();
var remoteStreams = null;
fetch('/streams.json').then((response) => {
    response.json().then((data) => {
        // filter own stream
        var streams = data.filter(function (stream) {
            return stream.id != client.getId();
        });
        // save new streams
        remoteStreams = streams;
        console.log(streams);
        if (streams.length) {
            client.peerInit(streams[0].id)
        }
    })
});
