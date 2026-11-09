// What a site permission prompt says, in Arc's words ("Allow https://meet.google.com to access your camera?").

export type PromptIcon = 'bell' | 'camera' | 'mic' | 'location' | 'clipboard' | 'screen' | 'device'

/** What the prompt view draws. */
export interface PermissionPrompt {
  id: string
  origin: string
  permission: string
  mediaTypes?: ('video' | 'audio')[]
  /** Where the arrow points, in px from the view's left edge; absent = a free-floating prompt without one. */
  arrowX?: number
}

/** Messages from the prompt view: it's ready, how tall it rendered, or the user's answer. */
export type PromptOp =
  | { kind: 'sync' }
  | { kind: 'size'; id: string; height: number }
  | { kind: 'answer'; id: string; answer: 'allow' | 'deny' | 'dismiss' }

export function promptText(permission: string, mediaTypes?: ('video' | 'audio')[]): { icon: PromptIcon; wants: string } {
  switch (permission) {
    case 'notifications':
      return { icon: 'bell', wants: 'send you notifications' }
    case 'media': {
      const camera = !mediaTypes?.length || mediaTypes.includes('video')
      const mic = !mediaTypes?.length || mediaTypes.includes('audio')
      if (camera && mic) return { icon: 'camera', wants: 'access your camera, microphone' }
      return camera ? { icon: 'camera', wants: 'access your camera' } : { icon: 'mic', wants: 'access your microphone' }
    }
    case 'geolocation':
      return { icon: 'location', wants: 'access your location' }
    case 'clipboard-read':
      return { icon: 'clipboard', wants: 'see text and images copied to the clipboard' }
    case 'display-capture':
      return { icon: 'screen', wants: 'share your screen' }
    case 'midi':
      return { icon: 'device', wants: 'use your MIDI devices' }
    case 'midiSysex':
      return { icon: 'device', wants: 'control and reprogram your MIDI devices' }
    case 'idle-detection':
      return { icon: 'device', wants: 'know when you’re actively using this device' }
    case 'hid':
      return { icon: 'device', wants: 'connect to HID devices' }
    case 'serial':
      return { icon: 'device', wants: 'connect to serial ports' }
    case 'usb':
      return { icon: 'device', wants: 'connect to USB devices' }
    default:
      return { icon: 'device', wants: `use ${permission}` }
  }
}
