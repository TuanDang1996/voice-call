/*
 * (C) Copyright 2014-2015 Kurento (http://kurento.org/)
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
function connect(reconnectName){
	const param = reconnectName ? `?name=${reconnectName}` : '';
	// var ws = new WebSocket('wss://media-demo.vinhnd.dev/signaling');
	console.log(param)
	// var ws = new WebSocket(`wss://media-demo.vinhnd.dev/signaling${param}`);
	var ws = new WebSocket(`ws://localhost:8444/signaling${param}`);
	var videoInput;
	var videoOutput;
	var webRtcPeer;
	var videoOutput2;
	var webRtcPeerRemote;

	var outputsObject = {}
	var outputArray

	var registerName = null;
	const NOT_REGISTERED = 0;
	const REGISTERING = 1;
	const REGISTERED = 2;
	var registerState = null
	var roomId = ''

	function setRegisterState(nextState) {
		switch (nextState) {
			case NOT_REGISTERED:
				$('#register').attr('disabled', false);
				$('#call').attr('disabled', true);
				$('#terminate').attr('disabled', true);
				break;

			case REGISTERING:
				$('#register').attr('disabled', true);
				break;

			case REGISTERED:
				$('#register').attr('disabled', true);
				setCallState(NO_CALL);
				break;

			default:
				return;
		}
		registerState = nextState;
	}


	const NO_CALL = 0;
	const PROCESSING_CALL = 1;
	const IN_CALL = 2;
	var callState = null

	function setCallState(nextState) {
		switch (nextState) {
			case NO_CALL:
				$('#call').attr('disabled', false);
				$('#terminate').attr('disabled', true);
				break;

			case PROCESSING_CALL:
				$('#call').attr('disabled', true);
				$('#terminate').attr('disabled', true);
				break;
			case IN_CALL:
				$('#call').attr('disabled', true);
				$('#terminate').attr('disabled', false);
				break;
			default:
				return;
		}
		callState = nextState;
	}

	window.onload = function () {
		console = new Console();
		setRegisterState(NOT_REGISTERED);
		videoInput = document.getElementById('videoOutput3');
		videoOutput = document.getElementById('videoOutput');
		videoOutput2 = document.getElementById('videoOutput2');
		document.getElementById('name').focus();

		document.getElementById('register').addEventListener('click', function () {
			register();
		});
		document.getElementById('call').addEventListener('click', function () {
			call();
		});
		document.getElementById('terminate').addEventListener('click', function () {
			stop();
		});
		document.getElementById('join').addEventListener('click', function () {
			joinRoom();
		});

		document.getElementById('createGroup').addEventListener('click', function () {
			createGroup();
		});

		document.getElementById('addUser').addEventListener('click', function () {
			addMember();
		});

		document.getElementById('removeUser').addEventListener('click', function () {
			removeMember();
		});

		document.getElementById('fetchALlGroup').addEventListener('click', function () {
			fetchAllGroups();
		});

		document.getElementById('getAllMember').addEventListener('click', function () {
			getAllMemberByGroupId();
		});

	}

	window.onbeforeunload = function () {
		ws.close();
	}

	ws.onclose = function(e) {
		console.log('Socket is closed. Reconnect will be attempted in 1 second.', e.reason);
		setTimeout(function() {
			var name = document.getElementById('name').value;
			connect(name);
		}, 1000);
	};


	ws.onmessage = function (message) {
		var parsedMessage = JSON.parse(message.data);
		console.info('Received message: ' + message.data);

		switch (parsedMessage.id) {
			case 'registerResponse':
				resgisterResponse(parsedMessage);
				break;
			case 'callResponse':
				callResponse(parsedMessage);
				break;
			case 'incomingCall':
				incomingCall(parsedMessage);
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
			case 'reJoinCallAction':
				reJoinCall(parsedMessage)
				break;
			case 'iceCandidate':
				iceCandidateHandler(parsedMessage)
				break;
			default:
				console.error('Unrecognized message', parsedMessage);
		}
	}

	function reJoinCall(message) {
		joinRoom(message.roomId)
	}

	function iceCandidateHandler(message) {
		if (message.userName === document.getElementById('name').value) {
			webRtcPeer.addIceCandidate(message.candidate)
		} else {
			outputsObject[message.userName].addIceCandidate(message.candidate)
		}
	}

	function resgisterResponse(message) {
		if (message.response === 'accepted') {
			setRegisterState(REGISTERED);
		} else {
			setRegisterState(NOT_REGISTERED);
			var errorMessage = message.message ? message.message
				: 'Unknown reason for register rejection.';
			console.log(errorMessage);
			alert('Error registering user. See console for further information.');
		}
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
				remoteVideo: outputArray[message.userName],
				onicecandidate: onIceCandidate(message.userName),
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

			if(outputsObject[message.userName])
				outputsObject[message.userName].dispose()



			outputsObject[message.userName] = new kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options,
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
		setCallState(IN_CALL);
		outputsObject[message.userName].processAnswer(message.sdpAnswer);
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

		setCallState(PROCESSING_CALL);
		const hasConfirmed = true;
		if (hasConfirmed) {
			showSpinner(videoInput, videoOutput, videoOutput2);

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
				onicecandidate: onIceCandidate(document.getElementById('name').value),
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
			if (p.name === document.getElementById('name').value)
				return;

			const options = {
				remoteVideo: outputArray[p.name],
				onicecandidate: onIceCandidate(p.name),
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

			outputsObject[p.name] = new kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options,
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

	function reconnect(name){
		var message = {
			id: 'register',
			name: name
		};
		sendMessage(message);
	}

	function register() {
		var name = document.getElementById('name').value;
		if (name === '') {
			window.alert("You must insert your user name");
			return;
		}

		setRegisterState(REGISTERING);

		var message = {
			id: 'register',
			name: name
		};
		sendMessage(message);
		document.getElementById('peer').focus();
		outputArray = buildVideoAllocation()
	}

	function call() {
		if (document.getElementById('peer').value === '') {
			window.alert("You must specify the peer name");
			return;
		}

		setCallState(PROCESSING_CALL);

		showSpinner(videoInput, videoOutput, videoOutput2);

		var options = {
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
			onicecandidate: onIceCandidate(document.getElementById('name').value),
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
				this.generateOffer((error, offerSdp) => {
					const response = {
						id: 'call',
						from: document.getElementById('name').value,
						to: [document.getElementById('peer').value, document.getElementById('peer2').value],
						sdpOffer: offerSdp,

					};
					sendMessage(response);
				})
			})
	}

	function stop(message) {
		setCallState(NO_CALL);
		if (webRtcPeer) {
			webRtcPeer.dispose();
			webRtcPeer = null;

			Object.values(outputsObject).forEach(video => {
				video.dispose();
				video = null;
			})

			if (!message) {
				var message = {
					id: 'stop'
				}
				sendMessage(message);
			}
		}
		hideSpinner(videoInput, videoOutput, videoOutput2);
	}

	function sendMessage(message) {
		var jsonMessage = JSON.stringify(message);
		console.log('Sending message: ' + jsonMessage);
		ws.send(jsonMessage);
	}

	function onIceCandidate(name) {
		return (candidate) => {
			console.log('Local candidate' + JSON.stringify(candidate));

			var message = {
				id: 'onIceCandidate',
				candidate: candidate,
				name
			}
			sendMessage(message);
		}

	}

	function showSpinner() {
		for (var i = 0; i < arguments.length; i++) {
			arguments[i].poster = './img/transparent-1px.png';
			arguments[i].style.background = 'center transparent url("./img/spinner.gif") no-repeat';
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
	$(document).delegate('*[data-toggle="lightbox"]', 'click', function (event) {
		event.preventDefault();
		$(this).ekkoLightbox();
	});

	function buildVideoAllocation() {
		const nameArray = ["1", "2", "3"]
		const videoRemoteArray = [videoOutput, videoOutput2]
		let count = 0;
		let result = {}
		nameArray.forEach(name1 => {
			if (name1 === document.getElementById('name').value.toString())
				return;
			result[name1] = videoRemoteArray[count];
			count++;
		})
		return result
	}

	function joinRoom(roomId) {

		setCallState(PROCESSING_CALL);

		showSpinner(videoInput, videoOutput, videoOutput2);

		var options = {
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
			onicecandidate: onIceCandidate(document.getElementById('name').value),
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
				this.generateOffer((error, offerSdp) => {
					const response = {
						id: 'joinRoom',
						roomId: roomId ? roomId : document.getElementById('room').value,
						sdpOffer: offerSdp,

					};
					sendMessage(response);
				})
			})
	}

	function createGroup(){
		const groupName = document.getElementById('groupName').value
		var name = document.getElementById('name').value;
		const response = {
			id: 'createGroup',
			groupName: groupName,
			members: [name],

		};
		sendMessage(response);
	}

	function addMember(){
		const groupId = document.getElementById('groupId').value
		var name = document.getElementById('member1').value;
		const response = {
			id: 'addMember',
			groupId: groupId,
			members: [name],

		};
		sendMessage(response);
	}

	function removeMember(){
		const groupId = document.getElementById('groupId2').value
		var name = document.getElementById('member2').value;
		const response = {
			id: 'removeMember',
			groupId: groupId,
			members: [name],

		};
		sendMessage(response);
	}

	function fetchAllGroups(){
		const response = {
			id: 'getAllGroups'
		};
		sendMessage(response);
	}

	function getAllMemberByGroupId(){
		const groupId = document.getElementById('groupId3').value
		const response = {
			id: 'getAllMemberInGroup',
			groupId: groupId
		};
		sendMessage(response);
	}
}

connect()