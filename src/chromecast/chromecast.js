'use strict';

/**
 * Chromecast renderer/plugin
 *
 * Uses version 3.0 to take advantage of Google Cast Framework, and creates a button to turn on/off Chromecast streaming
 * @see https://developers.google.com/cast/docs/developers
 */
const CastRenderer = {
	name: 'chromecast',
	options: {
		prefix: 'chromecast'
	},

	/**
	 * Determine if a specific element type can be played with this render
	 *
	 * @return {Boolean}
	 */
	canPlayType: () => true,

	/**
	 * Create the player instance and add all native events/methods/properties as possible
	 *
	 * @param {MediaElement} mediaElement Instance of mejs.MediaElement already created
	 * @param {Object} options All the player configuration options passed through constructor
	 * @return {Object}
	 */
	create: (mediaElement, options) => {

		// API objects
		const
			c = {},
			readyState = 4,
			getErrorMessage = (error) => {

				const description = error.description ? ` : ${error.description}` : '.';

				let message;

				switch (error.code) {
					case chrome.cast.ErrorCode.API_NOT_INITIALIZED:
						message = `The API is not initialized${description}`;
						break;
					case chrome.cast.ErrorCode.CANCEL:
						message = `The operation was canceled by the user${description}`;
						break;
					case chrome.cast.ErrorCode.CHANNEL_ERROR:
						message = `A channel to the receiver is not available${description}`;
						break;
					case chrome.cast.ErrorCode.EXTENSION_MISSING:
						message = `The Cast extension is not available${description}`;
						break;
					case chrome.cast.ErrorCode.INVALID_PARAMETER:
						message = `The parameters to the operation were not valid${description}`;
						break;
					case chrome.cast.ErrorCode.RECEIVER_UNAVAILABLE:
						message = `No receiver was compatible with the session request${description}`;
						break;
					case chrome.cast.ErrorCode.SESSION_ERROR:
						message = `A session could not be created, or a session was invalid${description}`;
						break;
					case chrome.cast.ErrorCode.TIMEOUT:
						message = `The operation timed out${description}`;
						break;
					default:
						message = `Unknown error: ${error.code}`;
						break;
				}

				console.error(message);
			}
		;

		let
			castPlayer = mediaElement.castPlayer,
			castPlayerController = mediaElement.castPlayerController,
			volume = 1
		;

		c.options = options;
		c.id = mediaElement.id + '_' + options.prefix;
		c.mediaElement = mediaElement;

		// wrappers for get/set
		const
			props = mejs.html5media.properties,
			assignGettersSetters = (propName) => {
				const capName = `${propName.substring(0, 1).toUpperCase()}${propName.substring(1)}`;

				c[`get${capName}`] = () => {
					if (castPlayer !== null) {
						const value = null;

						switch (propName) {
							case 'currentTime':
								return castPlayer.currentTime;
							case 'duration':
								return castPlayer.duration;
							case 'volume':
								volume = castPlayer.volumeLevel;
								return volume;
							case 'paused':
								return castPlayer.isPaused;
							case 'ended':
								return castPlayer.ended;
							case 'muted':
								return castPlayer.isMuted;
							case 'src':
								return mediaElement.originalNode.getAttribute('src');
							case 'readyState':
								return readyState;
						}

						return value;
					} else {
						return null;
					}
				};

				c[`set${capName}`] = (value) => {
					if (castPlayer !== null) {
						switch (propName) {
							case 'src':
								const url = typeof value === 'string' ? value : value[0].src;
								mediaElement.originalNode.setAttribute('src', url);
								break;
							case 'currentTime':
								castPlayer.currentTime = value;
								castPlayerController.seek();
								setTimeout(() => {
									const event = mejs.Utils.createEvent('timeupdate', c);
									mediaElement.dispatchEvent(event);
								}, 50);
								break;
							case 'muted':
								if (value === true && !castPlayer.isMuted) {
									castPlayerController.muteOrUnmute();
								} else if (value === false && castPlayer.isMuted) {
									castPlayerController.muteOrUnmute();
								}
								setTimeout(() => {
									const event = mejs.Utils.createEvent('volumechange', c);
									mediaElement.dispatchEvent(event);
								}, 50);
								break;
							case 'volume':
								volume = value;
								castPlayer.volumeLevel = value;
								castPlayerController.setVolumeLevel();
								setTimeout(() => {
									const event = mejs.Utils.createEvent('volumechange', c);
									mediaElement.dispatchEvent(event);
								}, 50);
								break;
							case 'readyState':
								const event = mejs.Utils.createEvent('canplay', c);
								mediaElement.dispatchEvent(event);
								break;
							case 'playbackRate':
								mediaElement.originalNode.playbackRate = value;
								break;
							default:
								console.log('Chromecast ' + c.id, propName, 'UNSUPPORTED property');
								break;
						}

					}
				};

			}
		;

		for (let i = 0, total = props.length; i < total; i++) {
			assignGettersSetters(props[i]);
		}

		// add wrappers for native methods
		const
			methods = mejs.html5media.methods,
			assignMethods = (methodName) => {
				c[methodName] = () => {
					if (castPlayer !== null) {
						switch (methodName) {
							case 'play':
								if (castPlayer.isPaused) {
									castPlayerController.playOrPause();
									setTimeout(() => {
										const event = mejs.Utils.createEvent('play', c);
										mediaElement.dispatchEvent(event);
									}, 50);
								}
								break;
							case 'pause':
								if (!castPlayer.isPaused) {
									castPlayerController.playOrPause();
									setTimeout(() => {
										const event = mejs.Utils.createEvent('pause', c);
										mediaElement.dispatchEvent(event);
									}, 50);
								}
								break;
							case 'load':
								const
									url = mediaElement.originalNode.getAttribute('src'),
									type = mejs.Utils.getTypeFromFile(url),
									mediaInfo = new chrome.cast.media.MediaInfo(url, type),
									castSession = cast.framework.CastContext.getInstance().getCurrentSession()
								;

								// Find captions/audioTracks
								if (options.castEnableTracks === true) {
									const
										tracks = [],
										children = mediaElement.originalNode.children
									;

									let counter = 1;

									for (let i = 0, total = children.length; i < total; i++) {
										const
											child = children[i],
											tag = child.tagName.toLowerCase();

										if (tag === 'track' && (child.getAttribute('kind') === 'subtitles' || child.getAttribute('kind') === 'captions')) {
											const el = new chrome.cast.media.Track(counter, chrome.cast.media.TrackType.TEXT);
											el.trackContentId = mejs.Utils.absolutizeUrl(child.getAttribute('src'));
											el.trackContentType = 'text/vtt';
											el.subtype = chrome.cast.media.TextTrackType.SUBTITLES;
											el.name = child.getAttribute('label');
											el.language = child.getAttribute('srclang');
											el.customData = null;
											tracks.push(el);
											counter++;
										}
									}
									mediaInfo.textTrackStyle = new chrome.cast.media.TextTrackStyle();
									mediaInfo.tracks = tracks;
								}

								mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
								mediaInfo.streamType = chrome.cast.media.StreamType.BUFFERED;
								mediaInfo.customData = null;
								mediaInfo.duration = null;

								if (mediaElement.originalNode.getAttribute('data-cast-title')) {
									mediaInfo.metadata.title = mediaElement.originalNode.getAttribute('data-cast-title');
								}

								if (mediaElement.originalNode.getAttribute('data-cast-description')) {
									mediaInfo.metadata.subtitle = mediaElement.originalNode.getAttribute('data-cast-description');
								}

								if (mediaElement.originalNode.getAttribute('poster')) {
									mediaInfo.metadata.images = [
										{'url': mejs.Utils.absolutizeUrl(mediaElement.originalNode.getAttribute('poster'))}
									];
								}

								const request = new chrome.cast.media.LoadRequest(mediaInfo);

								castSession.loadMedia(request).then(
									() => {
										// Autoplay media in the current position
										const currentTime = mediaElement.originalNode.getCurrentTime();
										c.setCurrentTime(currentTime);
										castPlayerController.playOrPause();

										setTimeout(() => {
											const event = mejs.Utils.createEvent('play', c);
											mediaElement.dispatchEvent(event);
										}, 50);
									},
									(error) => {
										getErrorMessage(error);
									}
								);
								break;
						}
					}
				};

			}
		;

		for (let i = 0, total = methods.length; i < total; i++) {
			assignMethods(methods[i]);
		}

		window[`__ready__${c.id}`] = () => {

			// Add event listeners for player changes which may occur outside sender app
			castPlayerController.addEventListener(
				cast.framework.RemotePlayerEventType.IS_PAUSED_CHANGED,
				() => {
					if (castPlayer.isPaused) {
						c.pause();
					} else {
						c.play();
					}
				}
			);
			castPlayerController.addEventListener(
				cast.framework.RemotePlayerEventType.IS_MUTED_CHANGED,
				() => c.setMuted(castPlayer.isMuted)
			);
			castPlayerController.addEventListener(
				cast.framework.RemotePlayerEventType.IS_MEDIA_LOADED_CHANGED,
				() => {
					setTimeout(() => {
						const event = mejs.Utils.createEvent('loadedmetadata', c);
						mediaElement.dispatchEvent(event);
					}, 50);
				}
			);
			castPlayerController.addEventListener(
				cast.framework.RemotePlayerEventType.VOLUME_LEVEL_CHANGED,
				() => {
					const event = mejs.Utils.createEvent('volumechange', c);
					mediaElement.dispatchEvent(event);
				}
			);
			castPlayerController.addEventListener(
				cast.framework.RemotePlayerEventType.DURATION_CHANGED,
				() => {
					setTimeout(() => {
						const event = mejs.Utils.createEvent('timeupdate', c);
						mediaElement.dispatchEvent(event);
					}, 50);
				}
			);
			castPlayerController.addEventListener(
				cast.framework.RemotePlayerEventType.CURRENT_TIME_CHANGED,
				() => {
					setTimeout(() => {
						const event = mejs.Utils.createEvent('timeupdate', c);
						mediaElement.dispatchEvent(event);
					}, 50);

					if (mediaElement.castPlayer.currentTime >= mediaElement.castPlayer.duration) {
						setTimeout(() => {
							const event = mejs.Utils.createEvent('ended', c);
							mediaElement.dispatchEvent(event);
						}, 50);
					}
				}
			);

			castPlayerController.addEventListener(
				cast.framework.RemotePlayerEventType.IS_MUTED_CHANGED,
				() => c.setMuted(castPlayer.isMuted)
			);

			c.load();
		};

		mediaElement.autoplay = false;

		// send it off for async loading and creation
		window[`__ready__${c.id}`]();

		c.setSize = () => {};

		c.hide = () => {};

		c.show = () => {};

		c.destroy = () => {
			if (castPlayer !== null) {
				castPlayerController.stop();
			}

			mediaElement.style.display = '';

		};

		return c;
	}
};

// Translations (English required)
mejs.i18n.en['mejs.chromecast-legend'] = 'Casting to:';

// Feature configuration
Object.assign(mejs.MepDefaults, {
	/**
	 * Title display
	 * @type {String}
	 */
	castTitle: null,

	/**
	 * Chromecast App ID
	 * @type {String}
	 */
	castAppID: null,

	/**
	 * Chromecast type of policy
	 * `origin`: Auto connect from same appId and page origin (default)
	 * `tab`: Auto connect from same appId, page origin, and tab
	 * `page`: No auto connect
	 *
	 * @type {String}
	 */
	castPolicy: 'origin',

	/**
	 * Whether to load tracks or not through Chromecast
	 *
	 * In order to process tracks correctly, `tracks` feature must be enable on the player configuration
	 * and user MUST set a custom receiver application.
	 * @see https://github.com/googlecast/CastReferencePlayer
	 * @see https://developers.google.com/cast/docs/receiver_apps
	 * @type {Boolean}
	 */
	castEnableTracks: false

});

Object.assign(MediaElementPlayer.prototype, {

	/**
	 * Feature constructor.
	 *
	 * Always has to be prefixed with `build` and the name that will be used in MepDefaults.features list
	 * @param {MediaElementPlayer} player
	 * @param {HTMLElement} controls
	 * @param {HTMLElement} layers
	 * @param {HTMLElement} media
	 */
	buildchromecast (player, controls, layers, media)  {

		const
			t = this,
			button = document.createElement('div'),
			castTitle = mejs.Utils.isString(t.options.castTitle) ? t.options.castTitle : 'Chromecast'
		;

		// Only one sender per page
		if (!player.isVideo || document.createElement('google-cast-button').constructor === HTMLElement) {
			return;
		}

		player.chromecastLayer = document.createElement('div');
		player.chromecastLayer.className = `${t.options.classPrefix}chromecast-layer ${t.options.classPrefix}layer`;
		player.chromecastLayer.innerHTML = `<div class="${t.options.classPrefix}chromecast-info"></div>`;
		player.chromecastLayer.style.display = 'none';

		layers.insertBefore(player.chromecastLayer, layers.firstChild);

		button.className = `${t.options.classPrefix}button ${t.options.classPrefix}chromecast-button`;
		button.innerHTML = `<button type="button" is="google-cast-button" aria-controls="${t.id}" title="${castTitle}" aria-label="${castTitle}" tabindex="0"></button>`;

		t.addControlElement(button, 'chromecast');
		t.castButton = button;

		// Activate poster layer
		player.chromecastLayer.innerHTML = `<div class="${t.options.classPrefix}chromecast-container">` +
			`<span class="${t.options.classPrefix}chromecast-icon"></span>` +
			`<span class="${t.options.classPrefix}chromecast-info">${mejs.i18n.t('mejs.chromecast-legend')} <span class="device"></span></span>` +
		`</div>`;

		if (media.originalNode.getAttribute('poster')) {
			player.chromecastLayer.innerHTML += `<img src="${media.originalNode.getAttribute('poster')}" width="100%" height="100%">`;
		}

		// Search for Chromecast
		let loadedCastAPI = false;

		if (!loadedCastAPI) {

			// Start SDK
			window.__onGCastApiAvailable = (isAvailable) => {
				if (isAvailable) {

					// Add renderer to the list
					mejs.Renderers.add(CastRenderer);

					button.style.width = '20px';

					setTimeout(() => {
						t.setPlayerSize(t.width, t.height);
						t.setControlsSize();
					}, 0);

					let origin;

					switch (t.options.castPolicy) {
						case 'tab':
							origin = 'TAB_AND_ORIGIN_SCOPED';
							break;
						case 'page':
							origin = 'PAGE_SCOPED';
							break;
						default:
							origin = 'ORIGIN_SCOPED';
							break;
					}

					cast.framework.CastContext.getInstance().setOptions({
						receiverApplicationId: t.options.castAppID || chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
						autoJoinPolicy: chrome.cast.AutoJoinPolicy[origin]
					});

					media.castPlayer = new cast.framework.RemotePlayer();
					media.castPlayerController = new cast.framework.RemotePlayerController(media.castPlayer);

					let currentTime = 0;

					// Set up renderer and device data
					media.castPlayerController.addEventListener(cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED, () => {
						if (cast && cast.framework) {
							if (media.castPlayer.isConnected) {
								const
									url = media.getSrc(),
									mediaFiles = [{src: url, type: mejs.Utils.getTypeFromFile(url)}]
								;

								const renderInfo = mejs.Renderers.select(mediaFiles, ['chromecast']);
								media.changeRenderer(renderInfo.rendererName, mediaFiles);

								const
									castSession = cast.framework.CastContext.getInstance().getCurrentSession(),
									deviceInfo = layers.querySelector(`.${t.options.classPrefix}chromecast-info`).querySelector('.device')
								;

								deviceInfo.innerText = castSession.getCastDevice().friendlyName;
								player.chromecastLayer.style.display = 'block';

								if (t.options.castEnableTracks === true) {
									const captions = player.captionsButton !== undefined ?
											player.captionsButton.querySelectorAll('input[type=radio]') : null;

									if (captions !== null) {
										for (let i = 0, total = captions.length; i < total; i++) {
											captions[i].addEventListener('click', function () {
												const
													trackId = parseInt(captions[i].id.replace(/^.*?track_(\d+)_.*$/, "$1")),
													setTracks = captions[i].value === 'none' ? [] : [trackId],
													tracksInfo = new chrome.cast.media.EditTracksInfoRequest(setTracks)
												;

												castSession.getMediaSession().editTracksInfo(tracksInfo, () => {}, (e) => {
													console.error(e);
												});
											});
										}

									}
								}

								media.addEventListener('timeupdate', () => {
									currentTime = media.getCurrentTime();
								});

								return;
							}
						}

						player.chromecastLayer.style.display = 'none';
						media.style.display = '';
						const renderInfo = mejs.Renderers.select(mediaFiles, media.renderers);
						media.changeRenderer(renderInfo.rendererName, mediaFiles);
						media.setCurrentTime(currentTime);

						// Continue playing if already started
						if (currentTime > 0 && !mejs.Features.IS_IOS && !mejs.Features.IS_ANDROID) {
							media.play();
						}
					});
				}
			};

			mejs.Utils.loadScript('https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1');
			loadedCastAPI = true;
		}
	},

	clearchromecast (player) {

		player.castPlayerController.stop();

		if (player.castButton) {
			player.castButton.remove();
		}

		if (player.chromecastLayer) {
			player.chromecastLayer.remove();
		}
	}
});
