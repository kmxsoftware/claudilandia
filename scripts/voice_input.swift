import Foundation
import Speech
import AVFoundation

class VoiceRecognizer: NSObject {
    private let audioEngine = AVAudioEngine()
    private var speechRecognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var running = true

    init(locale: String) {
        super.init()
        speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: locale))
    }

    func output(_ dict: [String: Any]) {
        if let data = try? JSONSerialization.data(withJSONObject: dict),
           let str = String(data: data, encoding: .utf8) {
            print(str)
            fflush(stdout)
        }
    }

    func start() {
        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            guard let self = self else { return }
            switch status {
            case .authorized:
                DispatchQueue.main.async {
                    self.startRecognition()
                }
            case .denied:
                self.output(["type": "error", "message": "Speech recognition denied. Enable in System Settings → Privacy → Speech Recognition."])
                exit(1)
            case .restricted:
                self.output(["type": "error", "message": "Speech recognition restricted on this device."])
                exit(1)
            case .notDetermined:
                self.output(["type": "error", "message": "Speech recognition not determined."])
                exit(1)
            @unknown default:
                self.output(["type": "error", "message": "Unknown speech recognition status."])
                exit(1)
            }
        }
    }

    func startRecognition() {
        guard let speechRecognizer = speechRecognizer, speechRecognizer.isAvailable else {
            output(["type": "error", "message": "Speech recognizer not available for this language."])
            exit(1)
            return
        }

        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let recognitionRequest = recognitionRequest else { return }
        recognitionRequest.shouldReportPartialResults = true

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
            recognitionRequest.append(buffer)
        }

        audioEngine.prepare()
        do {
            try audioEngine.start()
            output(["type": "started"])
        } catch {
            output(["type": "error", "message": "Audio engine failed: \(error.localizedDescription)"])
            exit(1)
        }

        recognitionTask = speechRecognizer.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self = self else { return }

            if let result = result {
                let text = result.bestTranscription.formattedString
                let isFinal = result.isFinal
                self.output(["type": isFinal ? "final" : "partial", "text": text])

                if isFinal {
                    self.restart()
                }
            }

            if let error = error as NSError? {
                if error.code == 216 || error.code == 1110 {
                    self.restart()
                } else {
                    self.output(["type": "error", "message": error.localizedDescription])
                    self.restart()
                }
            }
        }
    }

    func restart() {
        guard running else { return }
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionRequest = nil
        recognitionTask = nil

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            guard let self = self, self.running else { return }
            self.startRecognition()
        }
    }

    func stop() {
        running = false
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        output(["type": "stopped"])
        exit(0)
    }
}

// Parse language from CLI args (default: en-US)
let lang = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "en-US"
let recognizer = VoiceRecognizer(locale: lang)

// Listen for "stop" on stdin
DispatchQueue.global().async {
    while let line = readLine() {
        if line.trimmingCharacters(in: .whitespacesAndNewlines) == "stop" {
            DispatchQueue.main.async {
                recognizer.stop()
            }
        }
    }
    DispatchQueue.main.async {
        recognizer.stop()
    }
}

recognizer.start()
RunLoop.main.run()
