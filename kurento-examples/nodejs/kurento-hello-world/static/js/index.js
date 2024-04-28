/*
 * (C) Copyright 2015 Kurento (http://kurento.org/)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

var ws = new WebSocket('ws://localhost:8444/signaling');
var video;
var videoRemote;
var webRtcPeer;
var webRtcPeerRemote;
var state = null;
let isPlaying = true;
var isSeekable = false;
let name = null;

var I_CAN_START = 0;
var I_CAN_STOP = 1;
var I_AM_STARTING = 2;
let preAction = null;
let isStartingCall = false

window.onload = function() {
	console = new Console();
	video = document.getElementById('video');
	videoRemote = document.getElementById('videoRemote');
	setState(I_CAN_START);
	register()
}

window.onbeforeunload = function() {
	ws.close();
}

ws.onmessage = function(message) {
	var parsedMessage = JSON.parse(message.data);
	console.info('Received message: ' + message.data);

	switch (parsedMessage.id) {
		case 'registerResponse':
			registerResponse(parsedMessage);
			break;
		case 'startResponse':
			startResponse(parsedMessage);
			break;
		case 'error':
			if (state == I_AM_STARTING) {
				setState(I_CAN_START);
			}
			onError('Error message from server: ' + parsedMessage.message);
			break;
		case 'playEnd':
			playEnd();
			break;
		case 'videoInfo':
			showVideoData(parsedMessage);
			break;
		case 'seek':
			console.log (parsedMessage.message);
			break;
		case 'position':
			document.getElementById("videoPosition").value = parsedMessage.position;
			break;
		case 'checkCallQueueStatus':
			checkCallQueueStatus()
			break;
		case 'startCommunication':
			startCommunication(parsedMessage);
			break;
		case 'stopCommunication':
			console.info("Communication ended by remote peer");
			stop(true);
			break;
		case 'beginSendMedia':
			webRtcPeer.processAnswer(parsedMessage.sdpAnswer);
			break;
		case 'receiveMediasFrom':
			receiveMediasFrom(parsedMessage)
			break;
		case 'callResponse':
			callResponse(parsedMessage);
			break;
		case 'incomingCall':
			incomingCall(parsedMessage);
			break;
		case 'readyToConnectToStaff':
			readyToConnectToStaff();
			break;
		case 'iceCandidate':
			iceCandidateHandler(parsedMessage)
			break;
		default:
			if (state == I_AM_STARTING) {
				setState(I_CAN_START);
			}
			onError('Unrecognized message', parsedMessage);
	}
}


function readyToConnectToStaff(){
	var options = {
		localVideo: video,
		mediaConstraints: {
			audio: true,
			video: {
				mandatory: {
					maxWidth: 320,
					maxFrameRate: 15,
					minFrameRate: 15
				}
			}
		},
		onicecandidate: onIceCandidateV2(name),
		configuration: {
			iceServers: [
				{
					"url": "turn:103.56.163.217:3478",
					"username": "kurento",
					"credential": "kurento"
				}
			]
		}
	}

	console.info('Start connect to staff' + options);
	if(webRtcPeer){
		webRtcPeer.dispose();
		delete webRtcPeer;
	}
	webRtcPeer = new kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options,
		function(error) {
			if (error)
				return console.error(error);
			webRtcPeer.generateOffer(onOfferStaff);
		});
}
function iceCandidateHandler(message) {
	if (message.userName === name) {
		webRtcPeer.addIceCandidate(message.candidate)
	} else {
		webRtcPeerRemote.addIceCandidate(message.candidate)
	}
}

function incomingCall(message) {
	roomId = message.roomId
	// If bussy just reject without disturbing user
	if (callState !== NO_CALL) {
		var response = {
			id: 'incomingCallResponse',
			roomId: message.roomId,
			callResponse: 'reject',
			message: 'bussy'

		};
		return sendMessage(response);
	}

	const hasConfirmed = true;
	if (hasConfirmed) {

		const options = {
			localVideo: videoInput,
			mediaConstraints: {
				audio: true,
				video: {
					mandatory: {
						maxWidth: 320,
						maxFrameRate: 15,
						minFrameRate: 15
					}
				}
			},
			onicecandidate: onIceCandidateV2(name),
			configuration: {
				iceServers: [
					{
						"url": "turn:103.56.163.217:3478",
						"username": "kurento",
						"credential": "kurento"
					}
				]
			}
		}

		webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options,
			function (error) {
				if (error) {
					console.log(error);
					return;
				}
				this.generateOffer((error, sdp) => {
					var response = {
						id: 'incomingCallResponse',
						roomId: message.roomId,
						callResponse: 'accept',
						sdpOffer: sdp,

					};
					sendMessage(response);
				})
			})

	} else {
		var response = {
			id: 'incomingCallResponse',
			roomId: message.roomId,
			callResponse: 'reject',
			message: 'user declined'
		};
		sendMessage(response);
		// stop(true);
	}
}

function receiveMediasFrom(message) {
	webRtcPeer.processAnswer(message.sdpAnswer);
	message.participants.forEach(p => {
		if (p.name === name)
			return;

		const options = {
			remoteVideo: videoOutput,
			onicecandidate: onIceCandidateV2(p.name),
			configuration: {
				iceServers: [
					{
						"url": "turn:103.56.163.217:3478",
						"username": "kurento",
						"credential": "kurento"
					}
				]
			}
		}

		webRtcPeerRemote = new kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options,
			function (error) {
				if (error) {
					console.log(error);
					return;
				}
				this.generateOffer((error, sdp) => {
					var response = {
						id: 'receiveMediaFrom',
						roomId: message.roomId,
						remoteId: p.name,
						sdpOffer: sdp,

					};
					sendMessage(response);
				})
			})
	})
}

function callResponse(message) {
	if (message.response !== 'accept') {
		console.info('Call not accepted by peer. Closing call');
		var errorMessage = message.message ? message.message
			: 'Unknown reason for call rejection.';
		console.log(errorMessage);
		// stop(true);
	} else {

		const options = {
			remoteVideo: videoRemote,
			onicecandidate: onIceCandidateV2(message.userName),
			configuration: {
				iceServers: [
					{
						"url": "turn:103.56.163.217:3478",
						"username": "kurento",
						"credential": "kurento"
					}
				]
			}
		}
		if(webRtcPeerRemote)
			webRtcPeerRemote.dispose()

		webRtcPeerRemote = new kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options,
			function (error) {
				if (error) {
					console.log(error);
					return;
				}
				this.generateOffer((error, sdp) => {
					var response = {
						id: 'receiveMediaFrom',
						roomId: message.roomId,
						remoteId: message.userName,
						sdpOffer: sdp,

					};
					sendMessage(response);
				})
			})
	}
}

function startCommunication(message) {
	webRtcPeerRemote.processAnswer(message.sdpAnswer);
}

function checkCallQueueStatus(){
	if(!this.isStartingCall){
		console.log('Waiting for user to choose the action')
		return;
	}
	isPlaying = false

	var response = {
		id: 'clearSession'
	};
	sendMessage(response);
}

function onOfferStaff(error, offerSdp) {
	if (error)
		return console.error('Error generating the offer');
	console.info('Invoking SDP offer callback function ' + location.host);
	const val = document.getElementById("seekPosition").value

	var message = {
		id : 'startConnectToStaff',
		sdpOffer : offerSdp,
		serviceId: preAction
	}
	sendMessage(message);
}


function start() {
	video = document.getElementById('video');
	// Disable start button
	// setState(I_AM_STARTING);
	// showSpinner(video);

	// var mode = $('input[name="mode"]:checked').val();
	// console.log('Creating WebRtcPeer in ' + mode + ' mode and generating local sdp offer ...');

	// Video and audio by default
	var userMediaConstraints = {
		audio : true,
		video : false
	}

	var options = {
		remoteVideo : video,
		mediaConstraints : userMediaConstraints,
		onicecandidate : onIceCandidate,
		configuration: {
			iceServers: [
				{
					"url": "turn:103.56.163.217:3478",
					"username": "kurento",
					"credential": "kurento"
				}
			]
		}
	}

	console.info('User media constraints' + userMediaConstraints);
	if(webRtcPeer){
		webRtcPeer.dispose();
		delete webRtcPeer;
	}
	webRtcPeer = new kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options,
		function(error) {
			if (error)
				return console.error(error);
			webRtcPeer.generateOffer(onOffer);
		});
}

function registerResponse(messagee){
	console.log(`response after register: ${messagee}`)
}

function onOffer(error, offerSdp) {
	if (error)
		return console.error('Error generating the offer');
	console.info('Invoking SDP offer callback function ' + location.host);
	const val = document.getElementById("seekPosition").value

	var message = {
		id : 'makeCallQueue',
		sdpOffer : offerSdp,
		preAction,
		chosenAction: val
	}
	sendMessage(message);
}

function onError(error) {
	console.error(error);
}

function onIceCandidate(candidate) {
	console.log('Local candidate' + JSON.stringify(candidate));

	var message = {
		id : 'onIceCandidate',
		candidate : candidate,
		name,
		isPlaying
	}
	sendMessage(message);
}

function onIceCandidateV2(name) {
	return (candidate) => {
		console.log('Local candidate' + JSON.stringify(candidate));

		var message = {
			id: 'onIceCandidate',
			candidate: candidate,
			name,
			isPlaying
		}
		sendMessage(message);
	}

}

function startResponse(message) {
	setState(I_CAN_STOP);
	preAction=message.chosenActId
	console.log('SDP answer received from server. Processing ...');
	this.isStartingCall = message.isStartingCall;

	webRtcPeer.processAnswer(message.sdpAnswer, function(error) {
		if (error)
			return console.error(error);
	});
}

function pause() {
	togglePause()
	console.log('Pausing video ...');
	var message = {
		id : 'pause'
	}
	sendMessage(message);
}

function resume() {
	togglePause()
	console.log('Resuming video ...');
	var message = {
		id : 'resume'
	}
	sendMessage(message);
}

function stop() {
	console.log('Stopping video ...');
	setState(I_CAN_START);
	if (webRtcPeer) {
		webRtcPeer.dispose();
		webRtcPeer = null;

		var message = {
			id : 'stop'
		}
		sendMessage(message);
	}
	hideSpinner(video);
}

function debugDot() {
	console.log('Generate debug DOT file ...');
	sendMessage({
		id: 'debugDot'
	});
}

function playEnd() {
	setState(I_CAN_START);
	hideSpinner(video);
}

function doSeek() {
	var message = {
		id : 'doSeek',
		position: document.getElementById("seekPosition").value
	}
	sendMessage(message);
}


function clearIceCandidate() {
	var message = {
		id : 'clearIceCandidate'
	}
	sendMessage(message);
}


function getPosition() {
	var message = {
		id : 'getPosition'
	}
	sendMessage(message);
}

function showVideoData(parsedMessage) {
	//Show video info
	isSeekable = parsedMessage.isSeekable;
	if (isSeekable) {
		document.getElementById('isSeekable').value = "true";
		enableButton('#doSeek', 'doSeek()');
	} else {
		document.getElementById('isSeekable').value = "false";
	}

	document.getElementById('initSeek').value = parsedMessage.initSeekable;
	document.getElementById('endSeek').value = parsedMessage.endSeekable;
	document.getElementById('duration').value = parsedMessage.videoDuration;

	enableButton('#getPosition', 'getPosition()');
}

function setState(nextState) {
	switch (nextState) {
		case I_CAN_START:
			enableButton('#start', 'start()');
			disableButton('#pause');
			disableButton('#stop');
			disableButton('#debugDot');
			enableButton('#videourl');
			enableButton("[name='mode']");
			disableButton('#getPosition');
			disableButton('#doSeek');
			break;

		case I_CAN_STOP:
			// disableButton('#start');
			enableButton('#pause', 'pause()');
			enableButton('#stop', 'stop()');
			enableButton('#debugDot', 'debugDot()');
			disableButton('#videourl');
			disableButton("[name='mode']");
			break;

		case I_AM_STARTING:
			// disableButton('#start');
			disableButton('#pause');
			disableButton('#stop');
			disableButton('#debugDot');
			disableButton('#videourl');
			disableButton('#getPosition');
			disableButton('#doSeek');
			disableButton("[name='mode']");
			break;

		default:
			onError('Unknown state ' + nextState);
			return;
	}
	state = nextState;
}

function sendMessage(message) {
	var jsonMessage = JSON.stringify(message);
	console.log('Sending message: ' + jsonMessage);
	ws.send(jsonMessage);
}

function togglePause() {
	var pauseText = $("#pause-text").text();
	if (pauseText == " Resume ") {
		$("#pause-text").text(" Pause ");
		$("#pause-icon").attr('class', 'glyphicon glyphicon-pause');
		$("#pause").attr('onclick', "pause()");
	} else {
		$("#pause-text").text(" Resume ");
		$("#pause-icon").attr('class', 'glyphicon glyphicon-play');
		$("#pause").attr('onclick', "resume()");
	}
}

function disableButton(id) {
	// $(id).attr('disabled', true);
	// $(id).removeAttr('onclick');
}

function enableButton(id, functionName) {
	$(id).attr('disabled', false);
	if (functionName) {
		$(id).attr('onclick', functionName);
	}
}

function showSpinner() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].poster = './img/transparent-1px.png';
		arguments[i].style.background = "center transparent url('./img/spinner.gif') no-repeat";
	}
}

function hideSpinner() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].src = '';
		arguments[i].poster = './img/webrtc.png';
		arguments[i].style.background = '';
	}
}

/**
 * Lightbox utility (to display media pipeline image in a modal dialog)
 */
$(document).delegate('*[data-toggle="lightbox"]', 'click', function(event) {
	event.preventDefault();
	$(this).ekkoLightbox();
});

function register() {
	name = `${uuidv4()}`

	var message = {
		id: 'register',
		name: name
	};
	sendMessage(message);
}

function uuidv4() {
	return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
		(c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
	);
}