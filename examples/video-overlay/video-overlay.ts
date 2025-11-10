import {
	Input,
	Output,
	Conversion,
	ALL_FORMATS,
	BlobSource,
	UrlSource,
	BufferTarget,
	Mp4OutputFormat,
} from 'mediabunny';

import SampleFileUrl from '../../docs/assets/big-buck-bunny-trimmed.mp4';
import WatermarkUrl from '../../docs/public/mediabunny-logo.png';

(document.querySelector('#sample-file-download') as HTMLAnchorElement).href = SampleFileUrl;

const selectMediaButton = document.querySelector('#select-file') as HTMLButtonElement;
const loadUrlButton = document.querySelector('#load-url') as HTMLButtonElement;
const fileNameElement = document.querySelector('#file-name') as HTMLParagraphElement;
const horizontalRule = document.querySelector('hr') as HTMLHRElement;
const errorElement = document.querySelector('#error-element') as HTMLParagraphElement;
const progressContainer = document.querySelector('#progress-container') as HTMLDivElement;
const progressText = document.querySelector('#progress-text') as HTMLParagraphElement;
const progressBar = document.querySelector('#progress-bar') as HTMLDivElement;
const outputVideo = document.querySelector('#output-video') as HTMLVideoElement;

const WATERMARK_SIZE = 64;
const WATERMARK_PADDING = 32;

const processVideo = async (resource: File | string) => {
	fileNameElement.textContent = resource instanceof File ? resource.name : resource;
	horizontalRule.style.display = '';
	errorElement.textContent = '';
	progressContainer.style.display = 'none';
	outputVideo.style.display = 'none';
	outputVideo.src = '';

	try {
		// Load the watermark image
		const watermark = new Image();
		watermark.src = WatermarkUrl;
		await new Promise((resolve, reject) => {
			watermark.onload = resolve;
			watermark.onerror = reject;
		});

		// Create input from the resource
		const source = resource instanceof File
			? new BlobSource(resource)
			: new UrlSource(resource);
		const input = new Input({
			source,
			formats: ALL_FORMATS,
		});

		const videoTrack = await input.getPrimaryVideoTrack();
		if (!videoTrack) {
			throw new Error('File has no video track.');
		}

		if (videoTrack.codec === null) {
			throw new Error('Unsupported video codec.');
		}

		if (!(await videoTrack.canDecode())) {
			throw new Error('Unable to decode the video track.');
		}

		// Create output
		const output = new Output({
			target: new BufferTarget(),
			format: new Mp4OutputFormat(),
		});

		// Set up canvas context for compositing
		let ctx: OffscreenCanvasRenderingContext2D | null = null;

		// Create conversion with video processing
		const conversion = await Conversion.init({
			input,
			output,
			video: {
				process: (sample) => {
					if (!ctx) {
						// Create a canvas for image compositing
						const canvas = new OffscreenCanvas(
							sample.displayWidth,
							sample.displayHeight,
						);
						ctx = canvas.getContext('2d')!;
					}

					const rotation = sample.rotation;

					// Draw the original video frame
					ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
					sample.draw(ctx, 0, 0, rotation);

					// Draw the watermark in the top-left corner
					ctx.drawImage(
						watermark,
						WATERMARK_PADDING,
						WATERMARK_PADDING,
						WATERMARK_SIZE,
						WATERMARK_SIZE,
					);

					return ctx.canvas;
				},
			},
		});

		// Show progress
		progressContainer.style.display = 'flex';

		conversion.onProgress = (progress) => {
			const percentage = Math.round(progress * 100);
			progressBar.style.width = `${percentage}%`;
			progressText.textContent = `Processing... ${percentage}%`;
		};

		await conversion.execute();

		// Get the output blob and display it
		const blob = new Blob([output.target.buffer!], { type: output.format.mimeType });
		const url = URL.createObjectURL(blob);
		outputVideo.src = url;
		outputVideo.style.display = 'block';
		progressText.textContent = 'Complete!';
	} catch (error) {
		console.error(error);
		errorElement.textContent = String(error);
		progressContainer.style.display = 'none';
	}
};

/** === FILE SELECTION LOGIC === */

selectMediaButton.addEventListener('click', () => {
	const fileInput = document.createElement('input');
	fileInput.type = 'file';
	fileInput.accept = 'video/*,video/x-matroska';
	fileInput.addEventListener('change', () => {
		const file = fileInput.files?.[0];
		if (!file) {
			return;
		}

		void processVideo(file);
	});

	fileInput.click();
});

loadUrlButton.addEventListener('click', () => {
	const url = prompt(
		'Please enter a URL of a video file. Note that it must be HTTPS and support cross-origin requests, so have the'
		+ ' right CORS headers set.',
		'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
	);
	if (!url) {
		return;
	}

	void processVideo(url);
});

document.addEventListener('dragover', (event) => {
	event.preventDefault();
	event.dataTransfer!.dropEffect = 'copy';
});

document.addEventListener('drop', (event) => {
	event.preventDefault();
	const files = event.dataTransfer?.files;
	const file = files && files.length > 0 ? files[0] : undefined;
	if (file) {
		void processVideo(file);
	}
});
