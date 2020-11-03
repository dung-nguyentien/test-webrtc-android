function log (message) {
    var node = document.createElement("li");                 // Create a <li> node
    var textnode = document.createTextNode(message);         // Create a text node
    node.appendChild(textnode);                              // Append the text to <li>
    document.getElementById("log").appendChild(node);     // Append <li> to <ul> with id="myList"
}

var PeerManager = (function () {

    var localId,
        config = {
            peerConnectionConfig: {
                iceServers: [
                    { "url": "stun:23.21.150.121" },
                    { "url": "stun:stun.l.google.com:19302" }
                ]
            },
            peerConnectionConstraints: {
                optional: [
                    { "DtlsSrtpKeyAgreement": true }
                ]
            }
        },
        peerDatabase = {},
        localStream,
        remoteVideoContainer = document.getElementById('remoteVideosContainer'),
        socket = io();

    socket.on('message', handleMessage);
    socket.on('id', function (id) {
        localId = id;
    });

    function addPeer (remoteId) {
        var peer = new Peer(config.peerConnectionConfig, config.peerConnectionConstraints);
        peer.pc.onicecandidate = function (event) {
            if (event.candidate) {
                send('candidate', remoteId, {
                    label: event.candidate.sdpMLineIndex,
                    id: event.candidate.sdpMid,
                    candidate: event.candidate.candidate
                });
            }
        };
        peer.pc.onaddstream = function (event) {
            log('add new stream');
            attachMediaStream(peer.remoteVideoEl, event.stream);
            remoteVideosContainer.appendChild(peer.remoteVideoEl);
            log('add new stream ok');
        };
        peer.pc.onremovestream = function (event) {
            peer.remoteVideoEl.src = '';
            remoteVideosContainer.removeChild(peer.remoteVideoEl);
        };
        peer.pc.oniceconnectionstatechange = function (event) {
            log('oniceconnectionstatechange ' + (event.srcElement || event.target));
            switch (
                (event.srcElement // Chrome
                    || event.target) // Firefox
                    .iceConnectionState) {
                case 'disconnected':
                    remoteVideosContainer.removeChild(peer.remoteVideoEl);
                    break;
            }
        };
        peerDatabase[remoteId] = peer;

        return peer;
    }

    function answer (remoteId) {
        var pc = peerDatabase[remoteId].pc;
        pc.createAnswer(
            function (sessionDescription) {
                pc.setLocalDescription(sessionDescription);
                send('answer', remoteId, sessionDescription);
            },
            error
        );
    }

    function offer (remoteId) {
        var pc = peerDatabase[remoteId].pc;
        pc.createOffer(
            function (sessionDescription) {
                pc.setLocalDescription(sessionDescription);
                send('offer', remoteId, sessionDescription);
            },
            error
        );
    }

    function handleMessage (message) {
        var type = message.type,
            from = message.from,
            pc = (peerDatabase[from] || addPeer(from)).pc;

        console.log('received ' + type + ' from ' + from);
        log('received ' + type + ' from ' + from);
        switch (type) {
            case 'init':
                toggleLocalStream(pc);
                offer(from);
                break;
            case 'offer':
                pc.setRemoteDescription(new RTCSessionDescription(message.payload), function () {
                }, error);
                answer(from);
                break;
            case 'answer':
                pc.setRemoteDescription(new RTCSessionDescription(message.payload), function () {
                }, error);
                break;
            case 'candidate':
                if (pc.remoteDescription) {
                    pc.addIceCandidate(new RTCIceCandidate({
                        sdpMLineIndex: message.payload.label,
                        sdpMid: message.payload.id,
                        candidate: message.payload.candidate
                    }), function () {
                    }, error);
                }
                break;
        }
    }

    function send (type, to, payload) {
        console.log('sending ' + type + ' to ' + to);

        socket.emit('message', {
            to: to,
            type: type,
            payload: payload
        });
    }

    function toggleLocalStream (pc) {
        if (localStream) {
            (!!pc.getLocalStreams().length) ? pc.removeStream(localStream) : pc.addStream(localStream);
        }
    }

    function error (err) {
        console.log(err);
        log('error');
        log(err.message);
    }

    return {
        getId: function () {
            return localId;
        },

        setLocalStream: function (stream) {

            // if local cam has been stopped, remove it from all outgoing streams.
            if (!stream) {
                for (id in peerDatabase) {
                    pc = peerDatabase[id].pc;
                    if (!!pc.getLocalStreams().length) {
                        pc.removeStream(localStream);
                        offer(id);
                    }
                }
            }

            localStream = stream;
        },

        toggleLocalStream: function (remoteId) {
            peer = peerDatabase[remoteId] || addPeer(remoteId);
            toggleLocalStream(peer.pc);
        },

        peerInit: function (remoteId) {
            peer = peerDatabase[remoteId] || addPeer(remoteId);
            send('init', remoteId, null);
        },

        peerRenegociate: function (remoteId) {
            offer(remoteId);
        },

        send: function (type, payload) {
            socket.emit(type, payload);
        }
    };

});

var Peer = function (pcConfig, pcConstraints) {
    this.pc = new RTCPeerConnection(pcConfig, pcConstraints);
    this.remoteVideoEl = document.createElement('video');
    this.remoteVideoEl.controls = true;
}
