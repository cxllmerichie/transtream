import React from 'react'
import { useLocation } from 'react-router-dom'
import ErrorHeader from '../error-header'

let mediaOptions = {
  audio: true,
  video: true
}

const mediaErrorMessages = {
  NoMediaDevices: `MediaDevices API was not found. Publishing in Broadcast Box requires HTTPS 👮`,
  NotAllowedError: `You can't publish stream using your camera, because you have blocked access to it 😞`,
  NotFoundError: `Seems like you don't have camera 😭 Or you just blocked access to it...\n` +
    `Check camera settings, browser permissions and system permissions.`,
}

function Player(props) {
  const videoRef = React.useRef(null)
  const location = useLocation()
  const [mediaAccessError, setMediaAccessError] = React.useState(null)
  const [publishSuccess, setPublishSuccess] = React.useState(false)
  const [useDisplayMedia, setUseDisplayMedia] = React.useState(false)
  const [peerConnectionDisconnected, setPeerConnectionDisconnected] = React.useState(false)

  React.useEffect(() => {
    const peerConnection = new RTCPeerConnection() // eslint-disable-line
    let stream = null

    if (!navigator.mediaDevices) {
      setMediaAccessError({name: 'NoMediaDevices'})
      return
    }

    const mediaPromise = useDisplayMedia ?
      navigator.mediaDevices.getDisplayMedia(mediaOptions) :
      navigator.mediaDevices.getUserMedia(mediaOptions)

    mediaPromise.then(s => {
      if (peerConnection.connectionState === "closed") {
        s.getTracks().forEach(t => t.stop())
        return
      }

      stream = s
      videoRef.current.srcObject = s

      s.getTracks().forEach(t => {
        if (t.kind === 'audio') {
          peerConnection.addTransceiver(t, {direction: 'sendonly'})
        } else {
          peerConnection.addTransceiver(t, {
            direction: 'sendonly',
            sendEncodings: [
              {
                rid: 'high'
              },
              {
                rid: 'med',
                scaleResolutionDownBy: 2.0
              },
              {
                rid: 'low',
                scaleResolutionDownBy: 4.0
              }
            ]
          })
        }
      })

      peerConnection.oniceconnectionstatechange = () => {
        if (peerConnection.iceConnectionState === 'connected' || peerConnection.iceConnectionState === 'completed') {
          setPublishSuccess(true)
          setPeerConnectionDisconnected(false)
        } else if (peerConnection.iceConnectionState === 'disconnected' ||  peerConnection.iceConnectionState === 'failed') {
          setPublishSuccess(false)
          setPeerConnectionDisconnected(true)
        }
      }

      peerConnection.createOffer().then(offer => {
        peerConnection.setLocalDescription(offer)

        fetch(`${process.env.REACT_APP_API_PATH}/whip`, {
          method: 'POST',
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${location.pathname.split('/').pop()}`,
            'Content-Type': 'application/sdp'
          }
        }).then(r => {
          return r.text()
        }).then(answer => {
          peerConnection.setRemoteDescription({
            sdp: answer,
            type: 'answer'
          })
        })
      })
    }, setMediaAccessError)

    return function cleanup() {
      peerConnection.close()
      if (stream !== null) {
        stream.getTracks().forEach(t => t.stop())
      }
    }
  }, [videoRef, useDisplayMedia, location.pathname])

  return (
    <div className='container mx-auto'>
      {mediaAccessError != null && <ErrorHeader>
        {mediaErrorMessages[mediaAccessError.name] ?? 'Could not access your media device:\n' + mediaAccessError}
       </ErrorHeader>}
      {peerConnectionDisconnected && <ErrorHeader> WebRTC has disconnected or failed to connect at all 😭 </ErrorHeader>}
      {publishSuccess && <PublishSuccess />}
      <video
        ref={videoRef}
        autoPlay
        muted
        controls
        playsInline
        className='w-full h-full'
      />

      <button
        onClick={() => { setUseDisplayMedia(!useDisplayMedia)}}
        className="appearance-none border w-full mt-5 py-2 px-3 leading-tight focus:outline-none focus:shadow-outline bg-gray-700 border-gray-700 text-white rounded shadow-md placeholder-gray-200">
          {!useDisplayMedia && <> Publish Screen/Window/Tab instead </>}
          {useDisplayMedia && <> Publish Webcam instead </>}
      </button>
    </div>
  )
}

function PublishSuccess() {
  const subscribeUrl = window.location.href.replace('publish/', '')

  return (
    <p className={'bg-green-800 text-white text-lg ' +
      'text-center p-5 rounded-t-lg whitespace-pre-wrap'
    }>
      Live: Currently streaming to <a href={subscribeUrl} target="_blank" rel="noreferrer" className="hover:underline">{subscribeUrl}</a>
    </p>
  )
}

export default Player
