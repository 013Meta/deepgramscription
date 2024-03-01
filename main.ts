import { App, addIcon, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { createClient } from '@deepgram/sdk';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default'
}

const RECORDING_STARTED_NOTICE = "I'm listening...";
const RECORDING_STOPPED_NOTICE = "Stopping recording...";
const ERROR_ACCESS_MICROPHONE = 'Error accessing the microphone. Please ensure you have given access.';

export default class Deepscribe extends Plugin {
	settings: MyPluginSettings;
    mediaRecorder: MediaRecorder | null = null; // Add a class property to hold the MediaRecorder instance
    isRecording: boolean = false; // Add a flag to track recording state
    audioChunks: BlobPart[] = []; // Add a property to hold audio chunks

	async onload() {
		await this.loadSettings();

		this.setupRibbonIcon();

		this.setupStatusBar();

		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});

		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});

		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					if (!checking) {
						new SampleModal(this.app).open();
					}
					return true;
				}
			}
		});

		this.addSettingTab(new SampleSettingTab(this.app, this));

		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

    setupRibbonIcon() {
        const ribbonIconEl = this.addRibbonIcon('dice', 'Transcription', this.toggleRecording.bind(this));
        ribbonIconEl.addClass('my-plugin-ribbon-class');
    }

    setupStatusBar() {
        const statusBarItemEl = this.addStatusBarItem();
        statusBarItemEl.setText('Status Bar Text');
    }

    async toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
            new Notice(RECORDING_STOPPED_NOTICE);
        } else {
            new Notice(RECORDING_STARTED_NOTICE);
            await this.startRecording();
        }
    }

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.handleRecording(stream);
            this.isRecording = true;
        } catch (error) {
            console.error('Error accessing the microphone', error);
            new Notice(ERROR_ACCESS_MICROPHONE);
        }
    }

    handleRecording(stream: MediaStream) {
        this.mediaRecorder = new MediaRecorder(stream);
        this.audioChunks = [];

        this.mediaRecorder.ondataavailable = this.handleDataAvailable.bind(this);

        this.mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
            this.audioChunks = [];
            this.isRecording = false;

            const fileName = `Recording ${new Date().toISOString().replace(/[:.]/g, '')}.wav`;
            const filePath = `/Audio/${fileName}`;
            await this.app.vault.createBinary(filePath, await audioBlob.arrayBuffer());

            const noteName = `Note with ${fileName}`;
            const noteContent = `# Audio Note\n\n![[${filePath}]]`;
            await this.app.vault.create(noteName + '.md', noteContent);
        };

        this.mediaRecorder.start();
    }

    handleDataAvailable(event: MediaRecorderDataAvailableEvent) {
        this.audioChunks.push(event.data);
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;

            if (this.mediaRecorder.stream && this.mediaRecorder.stream.getTracks) {
                this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            }

            new Notice("Recording stopped.");
        }
    }

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async transcribeAudio(filePath: string) {
	  const deepgram = createClient(process.env.DG_API_KEY || '')
	  const dgConnection = deepgram.listen.live({ model: "nova" });

	  dgConnection.on('open', () => {
	    console.log('Connection opened.');

	    dgConnection.on('transcriptReceived', (data) => {
	      console.log(data);
	    });
	  });

	  dgConnection.on('close', () => {
	    console.log('Connection closed.');
	  });
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: Deepscribe;

	constructor(app: App, plugin: Deepscribe) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
