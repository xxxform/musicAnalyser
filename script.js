//Нагрузки системы globalKey. Содержит midi коды для ассоциаций с tonesLoadsMap
const systemLoads = []; 
const soundNames = [];
let toResize = null;
let rectClick = 0;
let isInterface = false;
let allOutputs = [];
let midifile;
let bpmVal = 0; //Влияет на tempOf4
let tempOf4 = 0; //ms длительность четверти. 
let fullTact = 0;
let globalKey = 1;
const timeSign = [4, 4];
let resizeTimeoutId = 0;
let tracksActiveSounds = new Map(); //Ключ-дорожка, значение-массив из её активных(сейчас звучащих) звуков
const trackMessageEmitters = new Map(); // Ключ-массив из её активных звуков дорожки, значение - ЕЕ(EventTarget) note on/off сообщений
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent);
const trackSelect = document.createElement('select');
trackSelect.multiple = true;
trackSelect.className = 'analyzedTracks';
trackSelect.size = 7;
trackSelect.onmouseleave = () => trackSelect.style.visibility = 'hidden';

 //globalKey назначить из localstorage в try catch
let storage = null;
try {
	storage = localStorage;
	const storageKey = storage.getItem('key');
	globalKey = storageKey === null ? 1 : storageKey;
} catch(e) {}
 
const analyzers = [];
const preSoloMutesDrum = []; //Массивы p элементов для solo/mute
const preSoloMutesInstr = [];

class Emitter {
  constructor() { this.callbacks = [] }
  addEventListener(f) { this.callbacks.push(f) }
  dispatchEvent(data) { for (let f of this.callbacks) f(data) }
  removeEventListener(f) {
	  const index = this.callbacks.indexOf(f);
	  if (index !== -1) this.callbacks.splice(index, 1);
  }
}

const timerCallback = e => e.target.disconnect(e.target.context.destination);

function setTimer(callback, time) {
	const timerSource = userInputAudioContext.createConstantSource();
	timerSource.buffer = userInputAudioContext.startBuffer;
	timerSource.connect(userInputAudioContext.destination); 
	timerSource.addEventListener('ended', callback);
	timerSource.addEventListener('ended', timerCallback);
	timerSource.start(time);
	timerSource.stop(time);
	return () => timerSource.removeEventListener('ended', callback);
}

//Компонент пианино
customElements.define("piano-roll", class extends HTMLElement {
	constructor() { // На мобилке тапы звук не дают, перепроверь после релиза. Тест флоатсаунд из песен, питчбенд на клаве юзера
		super(); 
		this.octaves = 4; 
		this.innerHTML = [0,1,0,1,0,0,1,0,1,0,1,0] //маска для создания одной октавы пианино ↔
		.map(isBlack => `<span class="${isBlack ? 'black' : 'white'}-wrap"><span> <span class="color"></span> <span class="content"></span> </span></span>`).join('')
		.repeat(this.octaves).concat(` <div class="fullScreenPianoButton">⤢</div>
			<label title="сдвиг октав" class="octaveShift"><input type="number" value="0"></label>
			<select class="quantize" title="Цветовая модель">
				<option value="redWhiteBlue" selected>Красный-белый-синий</option>
				<option value="yellowWhiteBlue">Желтый-белый-синий</option>
				<option value="yellowWhitePurple">Желтый-белый-фиолетовый</option>
				<option value="yellowPurple">Желтый-серый-фиолетовый</option>
				<option value="yellowBlue">Желтый-серый-синий</option>
				<option value="redBlue">Красный-серый-синий</option>
				<option value="monochrome">Чёрный-серый-белый</option>
				<option value="multicoloured">Цветной</option>
			</select>
			<label title="функция ноты" class="load">+1<input type="checkbox"></label>
			<label title="полная подсветка" class="light">💡<input type="checkbox"></label>
		`);

		this.fullScreenPianoButton = this.querySelector('div.fullScreenPianoButton');
		this.fullScreenPianoButton.onclick = () => {
			this.classList.toggle('fullScreenPiano');
			if (true) return;
				
			if (this.classList.contains('fullScreenPiano')) {
				const meta = document.createElement('meta');
				meta.setAttribute('name', 'viewport');
				meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, shrink-to-fit=no')
				document.head.appendChild(meta);
			} else {
				document.head.removeChild(document.head.querySelector('meta[name="viewport"]'));
			}
		}
		this.trackSoundEmitter = null;
		this.midiEventHandler = this.midiEventHandler.bind(this);
		this.tone = this.querySelector('select');
		this.tone.onchange = () => this.setColors(systemLoads);
		this.loadsView = this.querySelector('label.load > input');
		this.lightView = this.querySelector('label.light > input');
		this.lightView.onchange = () => this.setColors(systemLoads);
		this.octaveShift = this.querySelector('label.octaveShift > input');
		this.octaveShift.onchange = () => {
			for (let i = 0; i < this.octaves * 12; i++) {
				this.midiEventHandler([128, i]); //убераем следы игравших нот
			}
		}
		this.setColors(systemLoads);
		this.floatActiveCodesMap = new Map();
	}
	
	static get observedAttributes() {
		return ['emitter'];
	}
	
	set emitter(ee) {
		if (ee === null && this.trackSoundEmitter !== null) 
			this.trackSoundEmitter.removeEventListener(this.midiEventHandler);
		else if (ee !== null) 
			ee.addEventListener(this.midiEventHandler);
		
		this.trackSoundEmitter = ee;
	} 
	
	setColors(systemLoads) { 
		const childs = this.children;
		
		for (let i = 0; i < this.octaves * 12; i++) {
			const index = getOverflowIndex(i, 12);
			const load = systemLoads[index]; // холодные цвета - минор, теплые - мажор.
			let result = '';
			
			 //60 - желтый, 0 красный, 240 синий, 260 фиолетовый
			switch (this.tone.value) {
				case 'monochrome': result = `hsl(0,0%,${100 / 12 * (load + 6)}%)`; break; 
				case 'redWhiteBlue': result = `hsl(${load > 0 ? 0 : 240},100%,${(100) - Math.ceil(50/6 * Math.abs(load))}%)`; break;
				case 'yellowWhitePurple': result = `hsl(${load > 0 ? 60 : 260},100%,${(100) - Math.ceil(50/6 * Math.abs(load))}%)`; break;
				case 'yellowWhiteBlue': result = `hsl(${load > 0 ? 60 : 240},100%,${(100) - Math.ceil(50/6 * Math.abs(load))}%)`; break;
				case 'yellowPurple': result = `hsl(${load > 0 ? 60 : 260},${Math.ceil(100/6 * Math.abs(load))}%,50%)`; break;
				case 'yellowBlue': result =   `hsl(${load > 0 ? 60 : 240},${Math.ceil(100/6 * Math.abs(load))}%,50%)`; break;
				case 'redBlue': result =       `hsl(${load > 0 ? 0 : 240},${Math.ceil(100/6 * Math.abs(load))}%,50%)`; break;
				case 'multicoloured': result = !load ? 'grey' : `hsl(${(load < 0 ? 190 : -13) + Math.abs(load) * (load < 0 ? 16 : 13)}, 100%, 50%)`; break;
			}
			//case 'blackBlueWhite': result = `hsl(240,50%,${100 / 12 * (load + 6)}%)`; break; 

			childs[i].querySelector('.color').style.backgroundColor = result;

			if (this.lightView.checked) childs[i].firstChild.style.backgroundColor = result;
			else childs[i].firstChild.removeAttribute('style');
		}
	}
	
	toggle() {
		const flag = this.style.display === ''; //true если сейчас отображается. Переключаемся на off
		
		this.style.display = flag ? 'none' : '';

		if (flag) {//remove
			this.trackSoundEmitter.removeEventListener(this.midiEventHandler);
		} else { //add
			this.trackSoundEmitter.callbacks.unshift(this.midiEventHandler);
		}
		//this.trackSoundEmitter[`${flag ? 'remove': 'add'}EventListener`](this.midiEventHandler);
	}
	
	midiEventHandler([type, code]) { 
		let codeVal = +code;
		const isFloat = code instanceof FloatSound;
		
		if (isFloat && type === 128) codeVal = this.floatActiveCodesMap.get(code);
		
		if (code === void 0) {//обновить floatSounds
			for (const [floatSound, code] of this.floatActiveCodesMap) {
				this.midiEventHandler([128, code]);
				this.midiEventHandler([144, floatSound]);
			}
			return;
		}

		const indexForElem = isFloat ? code.getPitch() : codeVal; //getOverflowIndex(indexForElem + 12 при сдвиге на октаву вверх)
		const contentElement = this.children[getOverflowIndex(indexForElem - (+this.octaveShift.value * 12 || 0), this.octaves * 12)].querySelector('span.content');
		if (type === 144) { 
			contentElement.textContent = this.loadsView.checked ? systemLoads[simplifyMidiCode(codeVal)].toString().padStart(2, "+") : soundNames[simplifyMidiCode(codeVal)]; //codeVal для песен надо симплить
			if (!this.lightView.checked) 
				contentElement.parentElement.style.backgroundColor = contentElement.previousElementSibling.style.backgroundColor;
			if (isFloat) this.floatActiveCodesMap.set(code, indexForElem);
		} else if (type === 128) {
			contentElement.textContent = '';
			if (!this.lightView.checked) 
				contentElement.parentElement.style.backgroundColor = '';
			if (isFloat) this.floatActiveCodesMap.delete(code);
		}
	}
});

function solo(btn) {
	const channels = btn.closest('div.channels');
	const preSoloMutes = channels.classList.contains('drums') ? preSoloMutesDrum : preSoloMutesInstr;
	
	if (btn.classList.toggle('active')) {//Если активировали solo
		const soloTracks = channels.querySelectorAll('p > button.soloBtn.active');
		
		if (soloTracks.length === 1) { //первый засолирован
			const muteBtns = channels.querySelectorAll('p > button.muteBtn.active');
			for (let el of muteBtns) preSoloMutes.push(el.parentElement); //Запомнить замьюченные включая этот если был
			
			for (let trackP of channels.querySelectorAll('p')) { 
				const includeInPremute = preSoloMutes.includes(trackP);
				// continue в каких случаях не нужно менять mute
				if (trackP === btn.parentElement) {// Если в цикле встретили элемент на который кликнули
					if (!includeInPremute) continue
				} else { //Другой элемент
					if (includeInPremute) continue;
				}
				
				mute(trackP.children[0]);
			}
		} else  //Добавили ещё solo 
			mute(btn.previousElementSibling); //unmute его	
	} else { //Если деактивировали solo
		const soloTracks = channels.querySelectorAll('p > button.soloBtn.active');
		
		if (soloTracks.length === 0) { //последний solo	- разъмьютить все кроме preSoloMutes
			for (let trackP of channels.querySelectorAll('p')) {
				const include = preSoloMutes.includes(trackP);
				
				if (trackP === btn.parentElement) {// Если в цикле встретили элемент на который кликнули
					if (!include) continue;
				} else { //Другой элемент
					if (include) continue;
				}
				mute(trackP.children[0]);
			}
			preSoloMutes.length = 0;
		} else  //очередной solo	
			mute(btn.previousElementSibling); //mute его
		
	}
}

function mute(btn, isUserClick) {
	const channels = btn.closest('div.channels');
	const soloTracks = channels.querySelectorAll('p > button.soloBtn.active');
	
	const isClickToSoled = btn.nextElementSibling.classList.contains('active');
	const isClickToMuted = btn.classList.contains('active');
											
	if (soloTracks.length > 0 && isUserClick && (isClickToSoled || isClickToMuted))  //Замьютили соло - перевести на solo
		return solo(btn.nextElementSibling);
		
	const volume = btn.parentElement.querySelector('input[type="range"]');
	
	if (volume.disabled = btn.classList.toggle('active')) {
		volume.dataset.prevVal = volume.value;
		volume.value = 0; 
	} else 
		volume.value = volume.dataset.prevVal; 
	
	volume.dispatchEvent(new Event('input'));
}

function clearTracks() {
	//Сохранить первый трек и миди входы
	
	Array.from(tracksActiveSounds.entries()).forEach(([input, activeSound], index) => {
		if (input instanceof MIDIInput || index === 0) return false;
		codeEnvelopeMap.delete(input);
		trackMessageEmitters.delete(activeSound);
		tracksActiveSounds.delete(input);
		document.getElementById(`selins${index}`).parentElement.remove();
		trackSelect.querySelector(`option[value="${index}"]`).remove();
		//Из анализаторов выдрать trackSelect
		for (let a of analyzers) {
			const index = a.tracksActiveSounds.indexOf(activeSound);
			if (index !== -1) a.tracksActiveSounds.splice(index, 1);
		}
	});
	
	cntls.querySelectorAll('.drums > p').forEach(p => p.remove());
}

function addTrack(track) {
	codeEnvelopeMap.set(track, {});
	const tracksDiv = document.getElementById('channels');
	let result = '';	
	
	result += `<p>
	<button class="muteBtn" onclick="mute(this, true)">M</button><button class="soloBtn" onclick="solo(this)">S</button> 
	№ ${tracksActiveSounds.size} ${chooserIns(track.id === void 0 ? 0 : track.id, tracksActiveSounds.size)} 
	<input id="channel${tracksActiveSounds.size}" type="range" min="0" max="100" 
		value="${track.volume === void 0 ? 100 : track.volume * 100}" step="1" />
	<span class="indicator" title="Открыть пианоролл" onclick="this.nextElementSibling.toggle()" id="indicator${tracksActiveSounds.size}"></span>
	<piano-roll></piano-roll></p>`;
	
	tracksDiv.insertAdjacentHTML('beforeEnd', result);
	
	setVolumeAction(tracksActiveSounds.size, track);
	
	const addedTrackElement = tracksDiv.lastElementChild;
	const newSelect = addedTrackElement.children[2];
		
	trackSelect.append(new Option(
		`№${tracksActiveSounds.size}-${newSelect.selectedOptions[0].text}`,
		tracksActiveSounds.size
	));
	
	const trackSounds = [];
	tracksActiveSounds.set(track, trackSounds);	
	const soundEmitter = new Emitter();
	const piano = addedTrackElement.querySelector('piano-roll');
	piano.emitter = soundEmitter;
	piano.toggle();
	
	//Подсветка индикатора
	const indicator = addedTrackElement.querySelector('.indicator');
	soundEmitter.addEventListener(msg => {
		if (!(msg[1] instanceof FloatSound)) msg[1] = simplifyMidiCode(msg[1]);
		switch (msg[0]) {
			case 144: indicator.classList.add('active'); break;
			case 128: indicator.classList.remove('active'); break;
		}
	});

	piano.addEventListener(isMobile ? 'touchstart' : 'mousedown', event => {
		if (event.target.tagName !== 'SPAN') return; 

		let preRootElement = event.target;
		while(preRootElement.parentElement !== piano) {
			preRootElement = preRootElement.parentElement;
		}

		const index = Array.prototype.indexOf.call(piano.children, preRootElement);
		if (index === -1) return; //48 мидикод до малой октавы 
		midiMessageHandler.call(track, trackSounds, soundEmitter, {data: [144, index + 48 + (+piano.octaveShift.value * 12 || 0)]}); //index + 48 - 12 при переносе на октаву вверх

		document.body.addEventListener(isMobile ? 'touchend' : 'mouseup', function handler() {
			midiMessageHandler.call(track, trackSounds, soundEmitter, {data: [128, index + 48 + (+piano.octaveShift.value * 12 || 0)]});//index + 48 - 12 при переносе на октаву вверх
			document.body.removeEventListener(isMobile ? 'touchend' : 'mouseup', handler);
		});
	}); 
	
	trackMessageEmitters.set(trackSounds, soundEmitter);
	
	return document.getElementById(`channel${tracksActiveSounds.size - 1}`).parentElement;
}

window.addEventListener('resize', e => {
	if (analyzers.length === 0) return;
	
	clearTimeout(resizeTimeoutId);
    resizeTimeoutId = setTimeout(() => analyzers.forEach(a => {if (!a.showAll.checked) a.recalculateMaxTableRows()}), 100);
	 
	return false;
});

triton6b.onchange = e => { 
	for (let a of analyzers) {
		if (triton6b.checked === a.triton6b.checked) continue;
		a.triton6b.checked = triton6b.checked;
		a.onTriton6bChange();
	}
	
	const indexOfKey = soundNames.indexOf(getKey(+key.value));
	const indexOfTritone = getOverflowIndex(indexOfKey + 6, 12);
	soundNames[indexOfTritone] = getKey(+key.value + (triton6b.checked ? -6 : 6));

	const tritonIndex = systemLoads.indexOf(triton6b.checked ? 6 : -6);
	systemLoads[tritonIndex] = systemLoads[tritonIndex] * -1;
	
	document.getElementById('channels')
		.querySelectorAll('p > piano-roll')
		.forEach(p => p.setColors(systemLoads)); 
}

//Смена общей тональности
key.onchange = e => {
	const newKey = onChangeKey.call({triton6b, notesNames, key, systemLoads, soundNames}, e);
	
	for (let a of analyzers) {
		if (a.key.disabled) continue;
		a.key.value = +e.target.value;
		a.key.dispatchEvent(new CustomEvent('change', {detail: +e.target.value}));
	}
	
	if (storage !== null) {
		storage.setItem('key', newKey);
		if (filesinput.files[0] && e.isTrusted) //isTrusted - проставлено вручную
			storage.setItem(filesinput.files[0].name, newKey);
	}
	
	if (loadedsong !== null && e.isTrusted) {
		const firstMeta = loadedsong.meta.find(meta => meta.key !== void 0);
		if (!firstMeta) return;
		firstMeta.scale = 0;
		firstMeta.key = newKey;
	}
		
}

key.dispatchEvent(new CustomEvent('change', {detail: globalKey}));

function setFullTact() {
	fullTact = getFullTact(); 
	if (started) for (let a of analyzers) if (a.prevQuantize !== '0') a.restart();
}

function getFullTact() {
	return timeSign[0] * ( tempOf4 * (4 / timeSign[1]) );
}

function isEqual(a1, a2) {
	if (a1.length !== a2.length) return false;
	const a1Info = {}, a2Info = {};
	
	for (const val of a1) a1Info[val] = a1Info[val] === void 0 ? 1 : a1Info[val] + 1;
	for (const val of a2) a2Info[val] = a2Info[val] === void 0 ? 1 : a2Info[val] + 1;
	
	return Object.keys(a1Info).every(key => a1Info[key] === a2Info[key]);
}

// Можно EE в Map по track.
class Analyzer{//				     массив из ссылок на массивы активных звуков треков
	constructor(id = 0, parentElement, keyN = 1, tracksActiveSounds = [], triton6b = false) {
		this.id = id;
		this.systemLoads = []; //Хранятся midi коды клавиш текущей системы(тональности) по порядку loadsMap
		this.tracksActiveSounds = tracksActiveSounds;
		this.history = [];
		this.aModeAccumSounds = [];
		this.notesNames = []; //названия нот в виде цепи для select'а тоники
		this.soundNames = [];
		this.prevQuantize = '4';
		this.prevKey = null;
		this.lastComputedSounds = [];
		this.summedLoadsNoDbl = [];
		this.tactCounter = 0;
		
		parentElement.innerHTML = `
			<div class="wrapperAnalyzer">
				<form name="interface">
					<span><select class="key" title="Тональный центр"></select>
						<input type="checkbox" class="changeKeyDisabled" title="Закрепить">
					</span> |
					<span class="toAnalyze" title="Треки для анализа">Анализ</span> |
					1/<select class="quantize" title="Частота опроса">
						 <option value="0" title="Режим midi потока">flow</option>
						 <option value="0.5">0.5</option>
						 <option value="1">1</option>
						 <option value="2">2</option> 
						 <option value="4" selected>4</option>
						 <option value="8">8</option>
						 <option value="16">16</option> 
						 <option value="32">32</option>
						 <option value="64">64</option>
						 <option value="128">128</option>
						 <option value="3" title="Опрос триолями">3</option>
						 <option value="6">6</option>
						 <option value="12">12</option>
					</select> 
					<input title="Смещение опроса" type="number" class="offset" placeholder="ms"> |
					
					<span class="filters">
						<span class="innerFilters">
							<label><input type="checkbox" class="outCheckBox">выход</label>
							<label title="Скрыть весомость"><input type="checkbox" class="apCheckBox">сплавление</label>
							<label title="Движение звуков по цепи квинт"><input type="checkbox" class="outIntCheckBox">вне интервала</label>
							<label title="Не учитывать удвоения для цвета"><input type="checkbox" class="doublesCheckBox">удвоения</label>
							<label title="Не показывать появление такой-же области"><input type="checkbox" class="noRepeats">повторы</label>
							<label title="Не показывать пустые"><input type="checkbox" class="noEmptyTicks">пустоты</label>
							<label title="Не реагировать на поднятие клавиши в режиме flow"><input type="checkbox" class="noKeyUp">поднятие</label>
						</span>
						Вычет
					</span> |
					
					<span class="settings">
						<span class="innerSettings">
							<label><input type="checkbox" class="accordMode">Режим созвучия</label>
							<label><input type="checkbox" class="melodyMode">Одноголосый режим</label>
							<label title="Не скрывать области слева за пределами экрана"><input type="checkbox" class="showAll">Отображать все</label>
							<label title="Подстраивать высоту таблицы под содержимое"><input type="checkbox" checked class="collapse">Подстройка</label>
							<label><input type="checkbox" checked class="showNotes">Ноты на графике</label>
							<label title="Подсвечивать ячейку, равную lin созвучия(аккордовые таблицы)"><input type="checkbox" class="showLin">Подсветка ячейки lin</label>
							<label title="Подписывать lin в ячейку, равную lin созвучия"><input type="checkbox" class="showLinValue">Подпись ячейки lin</label>
							<label title="Тритон от тоники интерпретировать как 6β"><input type="checkbox" ${triton6b ? 'checked' : ''} class="triton6b">Тритон 6β</label>
						</span>
						Настройки
					</span> |
					
					<input type="button" class="clear" value="Очистить">
					<input type="button" class="remove" value="Удалить">
				</form>

				<table class="analyzer" rules="none">
					<thead><tr> <td>0</td> </tr></thead>
					<tfoot><tr> <td></td> </tr></tfoot>
					<tbody><tr class="f"> <td></td> </tr></tbody>
				</table>
				
				<div class="counters">
					<p class="ticks">ticks: <span>0</span></p>
					<p class="lastLin" title="Напряжение в lin виде за последний тик">lin: <span>0</span></p>
					<p class="apColors" title="Текущая гармония. Отражает и выделенные"><span class="apInfo">ap0+0a</span> <span class="colors"><span class="beta"></span><span class="alpha"></span></span></p>
					<p class="lastDelta" title="lin последнего тика - предыдущего">Δ: <span>0</span></p>
					<p class="maxDelta" title="относительно него вычисляется яркость Δ">max Δ: <span>0</span></p>
					<p class="sumDelta">sum |Δ|: <span>0</span></p>
					<p class="sumDeltaTicks" title="sum |Δ|/steps">dyn: <span>0</span></p>
					<p class="sumApNoDbl" data-ap="0,0">лад: <span class="apInfo"><span class="apInfoText">ap0+0a</span><span class="colors"><span class="beta"></span><span class="alpha"></span></span> </span> <span class="colors"><span class="beta"></span><span class="alpha"></span></span></p>
					<p class="sumAp" data-ap="0,0">sum: <span>ap0+0a</span></p>
					<p class="apTicks" data-ap="0">ap/ticks: <span>0</span></p>
					<p class="outTrace" title="Суммарный цвет выходов" data-ap="0,0">outAp: <span>ap0+0a</span></p>
					<p class="outTicks">outAp/ticks: <span>0a</span></p>
					<button class="reset">Сброс</button>
				</div>
			</div>
		`;

		const form = parentElement.querySelector('div.wrapperAnalyzer > form');
		const filters = form.querySelector('span.filters > span');
		const settings = form.querySelector('span.settings > span');
		this.table = parentElement.querySelector('div.wrapperAnalyzer > table.analyzer');
		this.counters = parentElement.querySelector('div.wrapperAnalyzer > div.counters');
		this.colors = this.counters.querySelector('p.apColors > .colors').children;
		
		// Фильтры
		this.outCheckBox = filters.querySelector('input.outCheckBox');
		this.apCheckBox = filters.querySelector('input.apCheckBox');
		this.outIntCheckBox = filters.querySelector('input.outIntCheckBox');
		this.doublesCheckBox = filters.querySelector('label > input.doublesCheckBox');
		this.noRepeats = filters.querySelector('label > input.noRepeats');
		this.noEmptyTicks = filters.querySelector('label > input.noEmptyTicks');
		this.noKeyUp = filters.querySelector('label > input.noKeyUp');
		
		// Настройки
		this.accordMode = settings.querySelector('label > input.accordMode');
		this.showLin = settings.querySelector('label > input.showLin');
		this.showLinValue = settings.querySelector('label > input.showLinValue');
		this.melodyMode = settings.querySelector('label > input.melodyMode');
		this.showAll = settings.querySelector('label > input.showAll');
		this.collapse = settings.querySelector('label > input.collapse');
		this.showNotes = settings.querySelector('label > input.showNotes');
		this.triton6b = settings.querySelector('label > input.triton6b');
		
		this.key = form.querySelector('span > select.key');
		this.changeKeyDisabled = form.querySelector('span > input.changeKeyDisabled');
		this.quantize = form.querySelector('select.quantize');
		
		this.offset = form.querySelector('input.offset');
		
		this.lastWidth = 0;
		
		form.querySelector('span.toAnalyze').onmouseenter = this.attachTracksSelectToAnalyzer.bind(this);
		form.querySelector('input.remove').onclick = this.remove.bind(this);
		form.querySelector('input.clear').onclick = this.clear.bind(this);
		
		this.counters.onclick = this.countersClick.bind(this);
		parentElement.firstElementChild.onscroll = this.onScroll.bind(this);
		
		this.onAnalyzeTrackChange = this.onAnalyzeTrackChange.bind(this);
		this.midiMessageHandler = this.midiMessageHandler.bind(this);
		this.triton6b.onchange = this.onTriton6bChange.bind(this);
		
		this.quantize.onchange = this.checkQuantize.bind(this);
		this.key.onchange = onChangeKey.bind(this);
		this.key.value = keyN;
		this.key.dispatchEvent(new CustomEvent('change', {detail: keyN}));
		this.table.tFoot.rows[0].cells[0].textContent = this.notesNames[6];
		
		this.accordMode.onchange = () => {
			this.aModeAccumSounds.length = 0;
			if (this.prevQuantize === '0') return;
			for (let track of this.tracksActiveSounds) 
				trackMessageEmitters.get(track)[`${this.accordMode.checked ? 'add': 'remove'}EventListener`](this.midiMessageHandler);
		}
		this.showAll.onchange = () => 
			this.recalculateMaxTableRows(...(this.showAll.checked ? [Infinity] : []));
		
		this.changeKeyDisabled.onchange = this.changeKeyDisableToggle.bind(this);
		this.timerId = () => {};

		this.table.tBodies[0].onmousedown = this.tableOnMouseDown = this.tableOnMouseDown.bind(this);
		
		this.prevTableClickData = null;
		this.lastScroll = 0;
	}
	
	onTriton6bChange(event) {
		this.systemLoads.some((val, i) => {
			if (Math.abs(val) == 6) {
				const indexOfKey = this.soundNames.indexOf(getKey(+this.key.value));
				const indexOfTritone = getOverflowIndex(indexOfKey + 6, 12);
				this.soundNames[indexOfTritone] = getKey(+this.key.value + (this.triton6b.checked ? -6 : 6));

				return this.systemLoads[i] *= -1; //Поменять soundNames
			}
		});
	}
	
	clear() {
		const length = this.table.tBodies[0].rows.length;
	
		for (let i = 0; i < length; i++) this.table.tBodies[0].deleteRow(0);
		for (let cell of Array.from(this.table.tHead.rows[0].cells)) 
			if ((+cell.textContent) !== 0) cell.remove();
		for (let cell of Array.from(this.table.tFoot.rows[0].cells)) 
			if (cell.cellIndex > 0) cell.remove();
		
		this.table.tFoot.rows[0].cells[0].textContent = this.notesNames[6];
			
		const newRow = this.table.tBodies[0].insertRow();
		newRow.className = 'f';
		newRow.insertCell();		
		
		this.history.length = this.aModeAccumSounds.length = this.lastComputedSounds = 0;
		this.prevTableClickData = null;
		this.counters.querySelector('.reset').click();
	}
	
	onScroll(e) { 
		if (this.showAll.checked) return;
		const currentScroll = this.table.parentElement.scrollWidth - this.table.parentElement.scrollLeft;
		const scrollLeft = e.target.scrollLeft;
		const tBody = this.table.tBodies[0];

		if (scrollLeft === 0) { 
			const index = (this.history.length - 1) - (tBody.rows.length);
			for (let i = 0; i > -2; i--) {
				const sounds = this.history[index + i]; 
				if (sounds === void 0) return;
				
				const [ap, loads] = this.getAp(sounds);
				tBody.append(this.drawData(this.getApByShowMode(ap, loads), loads));
			}
		} else if (currentScroll < this.lastScroll) { 
			const rowWidth = tBody.rows[0].clientWidth;
			const delta = Math.floor(scrollLeft / rowWidth);
			
			for (let i = 0; i < delta; i++) { //Если вся ширина от удаления станет меньше или равной ширене(т.е если скролл исчезнет-остановить)
				if (this.table.parentElement.scrollWidth - rowWidth <= this.table.parentElement.clientWidth) break;
				if (this.collapse.checked) this.collapseTable(); 
				tBody.deleteRow(-1);
			}
		}
		
		this.lastScroll = currentScroll; 
	} 
	
	countersClick(e) {
		if (!['P', 'BUTTON'].includes(e.target.tagName)) return;
		const span = e.target.firstElementChild;
			
		switch (e.target.className) {
			case 'lastLin': case 'sumDelta':
			span.textContent = '0'; break;
			case 'ticks': span.textContent = 0; break;
			case 'sumDeltaTicks': 
				span.textContent = '0'; 
				this.countersClick({target: e.target.parentElement.querySelector('.sumDelta')});
				this.countersClick({target: e.target.parentElement.querySelector('.ticks')});
				break;
			case 'sumApNoDbl':
				span.firstElementChild.textContent = 'ap0+0a'; 
				e.target.dataset.ap = '0,0';
				this.summedLoadsNoDbl.length = 0;
				const modeInfoSpan = span.parentElement.querySelector('.modeNameSpan');
				if (modeInfoSpan !== null) modeInfoSpan.remove();
				const colorSpan = span.nextElementSibling; 
				colorSpan.children[0].removeAttribute('style');
				colorSpan.children[1].removeAttribute('style');
				break;
			case 'apColors':
				span.textContent = 'ap0+0a'; 
				const colorSpans = span.parentElement.querySelector('.colors');
				colorSpans.children[0].removeAttribute('style');
				colorSpans.children[1].removeAttribute('style');
				break;
			case 'lastDelta':
				span.textContent = '0'
				span.parentElement.removeAttribute('style');
				break;
			case 'maxDelta': 
				span.textContent = '0';
				break;
			case 'sumAp':
				span.textContent = 'ap0+0a'; 
				e.target.dataset.ap = '0,0';
				break;
			case 'apTicks': 
				span.textContent = e.target.dataset.ap = '0'; 
				break;
			case 'outTrace': 
				span.textContent = 'ap0+0a'; 
				e.target.dataset.ap = '0,0';
				break;
			case 'outTicks': 
				span.textContent = '0a'; 
				break;
			case 'reset':
				for (const target of e.target.parentElement.children)
					if (target !== e.target)
						this.countersClick({target});
		}
	}
	
	tableOnMouseUp(firstRow, e) {
		const row = e.target.parentElement;
		if (row.tagName !== 'TR' || row.className[0] === 'f' || firstRow.className[0] === 'f') return;
		
		//удаление строк таблицы
		if (deleteMode.checked) {
			const fromTo = [row.rowIndex, firstRow.rowIndex];
			if (fromTo[0] > fromTo[1]) fromTo.reverse();
			const [min, max] = fromTo;
			
			for (let i = min; i <= max; i++) this.table.deleteRow(min);
			this.history.splice((this.history.length - 1) - (max - 1), max - min + 1);
			
			this.recalculateMaxTableRows();
			
			//Если удалена последняя сыгрынная - установить новую для корректной работы вычета повторов
			if (min === 1) this.lastComputedSounds = this.getAp(this.history[this.history.length - 1])[2];
			
			return;
		}
		
		row.classList.add('active');
		firstRow.classList.add('active');
		
		e.target.onmouseleave = e.target.onmousedown = () => { 
			row.classList.remove('active');
			firstRow.classList.remove('active');
		}
		
		if (row === firstRow) {
			const result = this.singleRangeInfo(row);
			if (result !== void 0) row.title = result;
		} else { //Диапазон
			row.title = firstRow.title = this.rowRangeInfo(row.rowIndex, firstRow.rowIndex);
		}
	}
	
	tableOnMouseDown(e) {
		const row = e.target.parentElement;
		if (row.tagName !== 'TR' || row.id[0] === 'f') return;//FirstRow
		
		this.table.tBodies[0].onmouseup = this.tableOnMouseUp.bind(this, row);
		this.table.tBodies[0].onmouseleave = () => this.table.tBodies[0].onmouseup = null;
	}
	
	rowRangeInfo(...fromTo) {
		if (fromTo[0] > fromTo[1]) fromTo.reverse();
		const [min, max] = fromTo;
		const apSum = [0, 0];
		const apSumTest = [0, 0];
		const apNoDbl = [0, 0];
		const summedCodes = [];
		const ticks = max - min;
		let linSum = 0;
		let prevLin = null;
		
		for (let i = min; i <= max; i++) {
			const index = (this.history.length - 1) - (i - 1);
			const sounds = this.history[index]; 
			const [ap, loads, codes] = this.getAp(sounds);
			const currentLin = getLinearSumByLoads(loads);
			
			if (prevLin !== null) 
				linSum += Math.abs(currentLin - prevLin);
			
			apSum[0] += ap[0]; apSum[1] += ap[1];
			
			for (let j = 0; j < loads.length; j++) {
				const load = loads[j];
				const code = codes[j];
				if (summedCodes.includes(code)) continue
				else summedCodes.push(code), apNoDbl[+(load > 0)] += load;
			}
			
			prevLin = currentLin;
		}
		
		let result = '';
		result += `Выделено: ${ticks + 1} строк\n`;
		result += `apSum: ${getApString(apSum)}\n`;
		result += `apSum-dbl: ${getApString(apNoDbl)}\n`;
		result += `Звуки-dbl: ${summedCodes.map(code => this.soundNames[code])}\n`; //Сортировать 
		result += `sum |Δ|: ${linSum}\n`;
		result += `dyn: ${(linSum / ticks).toFixed(2)}\n`;
		
		setCirclesColor(this.colors, apSum);
		this.colors[0].parentElement.previousElementSibling.textContent = getApString(apSum);
			
		return result;
	}
	
	singleRangeInfo(row) {
		const sounds = this.history[(this.history.length - 1) - (row.rowIndex - 1)]; 
		if (sounds.every(track => track.length === 0)) {this.prevTableClickData = null; return};
		
		const [ap, loads, summedSounds] = this.getAp(sounds); //Без showMode тк он работает только с ap и не трогает summedSounds
		const linSum = getLinearSumByLoads(loads); //в более простых случаях использовать getLinearSum
		const [intervals, copy] = getIntervalsByLoads(loads);
		const minLoad = Math.min(...loads);
		const maxLoad = Math.max(...loads);
		const intChain = [];
		
		copy.sort((...args) => {
			const [current, next] = args;
			return current - next;
		});
		
		copy.sort((...args) => {
			const [current, next] = args;
			const linInterval = Math.abs(current-next);
			if (linInterval > 0) intChain.push(linInterval);
		});
		
		let result = '';
		result += `Созвучие: ${summedSounds.map(code => this.soundNames[code])}\n`; 
		result += `Нагрузки: ${loads}\n`;
		if (intervals.length > 0) result += `Интервалы: ${intervals}\n`;
		// Из за устранения различий меж квартовыми и квинтовыми интервалами вводит в заблуждение. Показывает обращения
		const linInterval = Math.abs(maxLoad-minLoad);
		result += `intLoad: ${linInterval} (${intervalNames[linInterval]})\n`; //Интервальная нагрузка
		result += `intChain: ${intChain.join('+')}\n`;
		result += `Цвет: ${getApString(ap)}\n`;
		result += `lin: ${linSum}\n`;
		// Количество звуков можно было получить из linSum созвучия как Math.abs(linSum[0] - (-linSum[1]))
		setCirclesColor(this.colors, ap);
		this.colors[0].parentElement.previousElementSibling.textContent = getApString(ap);
		
		if (this.prevTableClickData !== null) {
			const newLastDel = linSum - this.prevTableClickData.linSum;
			const newDelta = addSign(newLastDel);
			result += `Δ:${newDelta}\n`;
			const deltaIntload = Math.max(maxLoad, this.prevTableClickData.maxLoad) - 
								 Math.min(minLoad, this.prevTableClickData.minLoad);
			result += `ΔintLoad: ${deltaIntload}(${intervalNames[deltaIntload]})\n`;
			
			const lastDel = this.counters.querySelector('p.lastDelta');
			lastDel.firstElementChild.textContent = newDelta;					
			lastDel.style.backgroundColor = newLastDel === 0 ? 'white' : 
				`rgba(${newLastDel > 0 ? '255,0,0' : '0,0,255'},${1 / +this.counters.querySelector('p.maxDelta > span').textContent * Math.abs(newLastDel)})`;
		}
		
		this.prevTableClickData = {linSum, minLoad, maxLoad};
		return result;
	}
	
	checkQuantize({target: {value}}) {
		if (value === '0') { //активирован Flow режим потока
			if (started) this.stop();
			if (!this.accordMode.checked) 
				for (let track of this.tracksActiveSounds) 
					trackMessageEmitters.get(track).addEventListener(this.midiMessageHandler);
		} else if (this.prevQuantize === '0') { //Если до этого был режим потока - удалить обработчики
			if (!this.accordMode.checked) 
				for (let track of this.tracksActiveSounds) 
					trackMessageEmitters.get(track).removeEventListener(this.midiMessageHandler);
			if (started) 
				this.start();
		}
		
		this.prevQuantize = value;
	}
	
	midiMessageHandler([type, code]) { //Этот обработчик может быть только для flow и bpm+accordMode
		if (this.accordMode.checked) {
			if (type === 144) this.aModeAccumSounds.push(code);
			else if (type === 128 && this.prevQuantize === '0') {//Только для flow
				if (this.tracksActiveSounds.every(trackSounds => trackSounds.length === 0)) {
					this.tick([this.aModeAccumSounds]); //Не очень корректно тк история переписывается на переданное
					this.aModeAccumSounds.length = 0;
				}
			}
		} else if (this.melodyMode.checked && code !== void 0) {
			if (type === 144) this.tick([[code]]);
		} else if (this.prevQuantize === '0' && !(type === 128 && this.noKeyUp.checked))
			this.tick();  // происходит при update слайда и отпускании
	}
	
	attachTracksSelectToAnalyzer(e) {
		const tas = Array.from(tracksActiveSounds.values());
		const indexes = this.tracksActiveSounds.map(track => tas.indexOf(track));
		
		//Проставили selected
		for (let option of trackSelect.options) 
			option.selected = indexes.includes(+option.value);
			
		if (trackSelect.onchange !== this.onAnalyzeTrackChange) 
			trackSelect.onchange = this.onAnalyzeTrackChange;
		
		e.target.prepend(trackSelect); //Перенесли select к analyzer
		
		trackSelect.style.visibility = 'visible';
	}
	
	onAnalyzeTrackChange(e) {		
		const tas = Array.from(tracksActiveSounds.values());
		
		if (this.prevQuantize === '0' || this.accordMode.checked)
			this.tracksActiveSounds.forEach(track =>  //Нужно снять прошлые 
				trackMessageEmitters.get(track).removeEventListener(this.midiMessageHandler));
		
		this.tracksActiveSounds = Array.from(trackSelect.selectedOptions).map(opt => {
			const track = tas[opt.value]; //Поставить новые
			if (this.prevQuantize === '0' || this.accordMode.checked) 
				trackMessageEmitters.get(track).addEventListener(this.midiMessageHandler);
			return track;
		});
	}
	
	remove() {
		this.stop();
		this.table.parentElement.parentElement.nextElementSibling.remove();
		this.table.parentElement.parentElement.remove();
		analyzers.splice(this.id, 1);
		for (const track of this.tracksActiveSounds) 
			trackMessageEmitters.get(track).removeEventListener(this.midiMessageHandler);
	}
	
	recalculateMaxTableRows(width = this.table.parentElement.scrollWidth - this.table.parentElement.scrollLeft) {
		const rowWidth = this.table.tBodies[0].rows[0].clientWidth;
		const newVal = Math.floor(width / rowWidth); //сколько помещается строк в область видимости width
		let delta = this.table.tBodies[0].rows.length - newVal; // this.table.tBodies[0].clientWidth - сколько помещалось ранее
		
		this.lastScroll = this.table.parentElement.scrollLeft;
		//В history нет первой строки помимо шкалы
		
		if (delta === 0) return;
		if (delta > 0) { //уменьшено кол-во строк
			const parent = this.table.parentElement;
			const collapse = this.collapse.checked;
			for (let i = 0; i < delta; i++) { //Если новая ширина будет без скролла - break
				if (this.table.parentElement.scrollWidth - rowWidth <= this.table.parentElement.clientWidth) break;
				this.table.tBodies[0].deleteRow(-1); // оставить скролл
			}
			if (collapse) this.collapseTable(true);
		} else if (this.history.length > 0) { //увеличить достать из истории и дорисовать если есть
			delta = Math.abs(delta); //сколько нового места появилось
			const aps = [];
			const loads = [];
			const maxOut = [0, 0];
				
			for (let i = 0; i < delta + 1; i++) {//history [0,1,2,3] //table [2,3]			
				const index = (this.history.length - 1) - (this.table.tBodies[0].rows.length) - i;
				const archivedActiveSounds = this.history[index];
				if (archivedActiveSounds === void 0) break;
				const [rawAp, soundLoads] = this.getAp(archivedActiveSounds); 
				const ap = this.getApByShowMode(rawAp, soundLoads);
				if (ap[0] < maxOut[0]) maxOut[0] = ap[0]; //Бета
				if (ap[1] > maxOut[1]) maxOut[1] = ap[1]; //Альфа
				aps.push(ap);
				loads.push(soundLoads);
			}
			
			if (aps.length === 0) return;
			this.expand(maxOut);
			this.table.tBodies[0].append(aps.reduce((newRows, ap, i) => {
				newRows.append(this.drawData(ap, loads[i], true));
				return newRows;
			}, new DocumentFragment()));
		}
	}
	
	changeKeyDisableToggle(e) {
		this.key.disabled = e.target.checked;
	}
	
	start(contextTime = userInputAudioContext.currentTime) {//Часто звук начинается чуть провее черты.
		const nextDraw = contextTime + ((fullTact / this.quantize.value + (+this.offset.value)) / 1000);
		this.table.tBodies[0].onmousedown = null;
		this.tick();		
		this.timerId = setTimer(() => this.start(nextDraw), nextDraw);
	}
	
	restart() {
		this.stop();
		this.start();
	}
	
	stop() {
		this.table.tBodies[0].onmousedown = this.tableOnMouseDown;
		this.timerId();
		this.tactCounter = 0;
	}
	
	tick(activeSounds = this.accordMode.checked && this.prevQuantize !== '0' ? [this.aModeAccumSounds] : this.tracksActiveSounds) {
		const [ap, soundLoads, summedSounds] = this.getAp(activeSounds);  
		if (this.noRepeats.checked && isEqual(summedSounds, this.lastComputedSounds)) return;
		
		const finalAp = this.getApByShowMode(Array.from(ap), soundLoads);
		if (this.noEmptyTicks.checked && finalAp[0] === 0 && finalAp[1] === 0) return; 
		//Записывать ли в историю всё что return отфильтровано
		this.lastComputedSounds = summedSounds;
		this.history.push(activeSounds.map(t => Array.from(t, Number))); 
		
		if (!this.showAll.checked && this.table.parentElement.scrollLeft > 0) {
			if (this.collapse.checked) this.collapseTable();
			this.table.tBodies[0].deleteRow(-1);
		}
		
		const newRow = this.drawData(finalAp, soundLoads);
		
		this.updateCounters(soundLoads, ap); 
		
		this.table.tBodies[0].prepend(newRow);
		
		if (this.prevQuantize !== '0' && this.accordMode.checked) this.aModeAccumSounds.length = 0; //Для bpm accordMode
		return newRow;
	}
	
	collapseTable(isResize = false) { // Уменьшает cells таблицы по максимальному отображаемому
		const table = this.table.tBodies[0]; 
		
		for (const action of ['last', 'first']) { //last для бета first для альфа координат
			if (!isResize && table.lastElementChild[`${action}ElementChild`].className !== '') continue;
				
			const scale = +this.table.tHead.rows[0][`${action}ElementChild`].textContent;
			for (let i = 1; i < scale; i++) //Если пусто в строке
				if (table.querySelector(`tr > td:${action}-child[class]`) === null) 
					for (const row of this.table.rows) row.deleteCell(action === 'last' ? -1 : 0); 
				else 
					break;
		}	
	}
	
	updateCounters(sounds, ap) { 	
		const [ticks, lastLin, apMoment, lastDel, maxDel, sumDel, sumDelTicks, sumApNoDbl, sumAp, apTicks, outTrace, outTicks] = this.counters.children;
		const newTicks = +ticks.firstElementChild.textContent + 1;
		ticks.firstElementChild.textContent = newTicks;
	
		const currentLin = getLinearSumByLoads(sounds);
		const prevLin = +lastLin.firstElementChild.textContent; 
		lastLin.firstElementChild.textContent = currentLin;
		
		const newSumAp = sumAp.dataset.ap.split(',').map((val, i) => +val + ap[i]);
		sumAp.dataset.ap = newSumAp; 
		sumAp.firstElementChild.textContent = getApString(newSumAp);
		
		const outLoad = ap[0] + ap[1]; 
		const newAccumAp = +apTicks.dataset.ap + Math.abs(ap[+(outLoad < 0)]);
		apTicks.dataset.ap = newAccumAp; 
		apTicks.firstElementChild.textContent = (newAccumAp / newTicks).toFixed(2);
		
		
		const outAp = outTrace.dataset.ap.split(',').map(i => parseInt(i));
		outAp[+(outLoad > 0)] += outLoad;
		outTrace.dataset.ap = outAp;
		outTrace.firstElementChild.textContent = getApString(outAp);
		const outApOut = outAp[0] + outAp[1];
		
		outTicks.firstElementChild.textContent = `${(Math.abs(outApOut) / newTicks).toFixed(2)}${outApOut > 0 ? 'a': 'b'}`;
		
		
		//сложение outTrace и apTicks даст sumAp
		setCirclesColor(this.colors, ap);
		apMoment.firstElementChild.textContent = getApString(ap);
		
		let changed = false;
		const noDblApSum = sumApNoDbl.dataset.ap.split(',').map(i => parseInt(i));
		const prevNoDbl = Array.from(noDblApSum);
		
		for (let load of sounds) {
			if (this.summedLoadsNoDbl.includes(load)) continue;
			this.summedLoadsNoDbl.push(load);
			if (!changed) changed = true;
			noDblApSum[+(load > 0)] += load;
		}
		
		if (changed) { //Диапазон звуков расширен
			const apInfo = sumApNoDbl.firstElementChild;
			setCirclesColor(apInfo.nextElementSibling.children, noDblApSum);
			const colors = apInfo.lastElementChild.children;
			sumApNoDbl.dataset.ap = noDblApSum;
			
			//Подсветка ладового пробоя
			colors[0].parentElement.classList.remove('animate');
			colors[0].style.backgroundColor = colors[1].style.backgroundColor = 'white';
			
			const res1 = noDblApSum[0] - prevNoDbl[0];
			const res2 = noDblApSum[1] - prevNoDbl[1];
			colors[0].style.backgroundColor = res1 === 0 ? 'white' : `rgba(0, 0, 255, ${1 / 21 * Math.abs(res1)})`;
			colors[1].style.backgroundColor = res2 === 0 ? 'white' : `rgba(255, 0, 0, ${1 / 21 * res2})`;
			
			window.requestAnimationFrame(() => { 
				colors[0].parentElement.classList.add('animate');
				colors[0].style.backgroundColor = colors[1].style.backgroundColor = 'white';
			});
			
			const apString = getApString(noDblApSum);
			apInfo.firstElementChild.textContent = apString; //Тут
			sumApNoDbl.title = this.summedLoadsNoDbl.sort((a, b) => a - b);
			const obj = modes[this.summedLoadsNoDbl.length - 5];
			
			if (obj !== void 0 && obj[this.summedLoadsNoDbl.join()] !== void 0) {
				let modeInfoSpan = sumApNoDbl.querySelector('.modeNameSpan');
				if (modeInfoSpan === null) {
					modeInfoSpan = document.createElement('span');
					modeInfoSpan.className = 'modeNameSpan';
					sumApNoDbl.append(modeInfoSpan);
				}
				modeInfoSpan.textContent = ' ' + obj[this.summedLoadsNoDbl.join()];
			}
		}
		
		
		if (newTicks === 1) return;
		
		const newLastDel = currentLin - prevLin;
		const newLastDelAbs = Math.abs(newLastDel);
		lastDel.firstElementChild.textContent = addSign(newLastDel);
		
		let maxDelta = +maxDel.firstElementChild.textContent;
		if (maxDelta < newLastDelAbs) 
			maxDel.firstElementChild.textContent = maxDelta = newLastDelAbs;
		
		//Подсветка яркости дельты относительно максимальной. Отражаю в цвете положительное значение
																	  //Если мажорное изменение
		lastDel.style.backgroundColor = newLastDel === 0 ? 'white' : `rgba(${newLastDel > 0 ? '255,0,0' : '0,0,255'},${1 / maxDelta * newLastDelAbs})`;
		
		const prevSum = +sumDel.firstElementChild.textContent;
		const newSum = prevSum + newLastDelAbs;
		sumDel.firstElementChild.textContent = newSum;  //step = ticks-1 т.е сколько совершено переходов.
		sumDelTicks.firstElementChild.textContent = (newSum / (newTicks-1)).toFixed(2);
	}
	
	//Расширит координаты если новые нагрузки за пределами
	expand(range) {
		const aDelta = range[1] - this.table.tHead.rows[0].firstElementChild.textContent;
		const bDelta = -range[0] - this.table.tHead.rows[0].lastElementChild.textContent;
		let added = null;
			
		//insertCell null = append undefined = prepend 1 = all. prepend beta append alpha axis
		//range[0] is beta max 0, range[1] is alpha min 0
		
		if ((bDelta > 0 || aDelta > 0)) {
			for (let i = 0; i < this.table.rows.length; i++) {
				const row = this.table.rows[i];
				const isNoteScale = row.parentElement.tagName === 'TFOOT';
				
				for (let j = 0; j < aDelta; j++) {
					added = row.insertCell(0);
					if (i == 0) // Для оси координат
						added.textContent = +added.nextElementSibling.textContent + 1;
					if (isNoteScale) {
						added.textContent = getKey(getCountOfFifthByKey(added.nextElementSibling.textContent) + 1);
					}
				}
				for (let k = 0; k < bDelta; k++) {
					added = row.insertCell();
					if (i == 0) //Для оси координат
						added.textContent = +added.previousElementSibling.textContent + 1;
					if (isNoteScale) {
						added.textContent = getKey(getCountOfFifthByKey(added.previousElementSibling.textContent) - 1);
					}
				}
			} 
		}
	}
	
	//Добавление и окраска новой строки
	drawData(range, loads, skipExpand) { 
		if (!skipExpand) this.expand(range);
		
		const newRow = document.createElement('tr');
		const cellLength = this.table.rows[0].cells.length;
		const outLoad = range[0] + range[1]; //отрицательный если выход бетный 
		let outLoadCount = Math.abs(outLoad);
		let isNegative = false;
		let added = null;
		
		for (let i = 0; i < cellLength; i++) {// Добавление новых строк(ячеек)
			added = newRow.insertCell();
			const currentScaleCell = this.table.tHead.rows[0].cells[i];
			isNegative = isNegative || (currentScaleCell.previousElementSibling ? 
				currentScaleCell.previousElementSibling.textContent == '0'
				: false);
			
			const currentCellLoad = (isNegative ? -1 : 1) * (+currentScaleCell.textContent);
			if (currentCellLoad === 0) added.classList.add('centerCell')
			
			//Если ячейка на шкале входит в диапазон
			if (currentCellLoad >= range[0] && currentCellLoad <= range[1]) {
				if (loads.includes(currentCellLoad)) {
					added.classList.add('load');
					if (this.showNotes.checked)
						added.textContent = this.notesNames[6 + currentCellLoad];
				}
				//Подсветка ячейки lin
				if (currentCellLoad === range[0] + range[1]) {
					if (this.showLin.checked) added.classList.add('linCell');
					if (this.showLinValue.checked) added.textContent = currentCellLoad;
				}
				
				if (outLoad >= 0 && !isNegative && outLoadCount > 0) {
					added.classList.add('outCell');
					outLoadCount--;
					continue;
				} else if (outLoad < 0 && isNegative && currentCellLoad < range[0]+outLoadCount) {
					added.classList.add('outCell');
					continue;
				} 
				added.classList.add('apCell');
			}
		}
		
		if (this.prevQuantize !== '0') //Тактовая черта
			if ((this.tactCounter = this.tactCounter >= +this.prevQuantize ? 1 : this.tactCounter + 1) === 1) 
				newRow.classList.add('tact');
		
		return newRow;
	}
	
	getApByShowMode(ap, loads) {//Изменяет исходный ap
		const out = this.outCheckBox.checked;
		const ap1 = this.apCheckBox.checked;
		const outLoad = ap[0] + ap[1]; //Выход и сплавл можно отсюда в счетчики(data). 
		const showMod = ((out ^ ap1) && (ap1 || out + 1)); 
		//0 - не выбрано или выбрано оба. 1 - фильтр сплавления 2 - выхода
		
		if (showMod != 0 && !(showMod == 2 && !outLoad)) {
			if (showMod == 1) {
				if (outLoad == 0) ap[0] = 0, ap[1] = 0;
				else 
					ap[+(outLoad < 0)] = 0,
					ap[+(outLoad > 0)] = outLoad;
			} else 
				ap[+(outLoad > 0)] -= outLoad;
		}
		
		if (this.outIntCheckBox.checked && loads.length > 0) {// Math... без агрументов дает Infinity
			ap[0] = Math.min(...loads); //Бета  
			ap[1] = Math.max(...loads); //Альфа
		}
		
		return ap;
	}

	getAp(activeSounds){
		if (this.melodyMode.checked && (this.quantize.value !== '0' || (activeSounds.length > 0 && activeSounds[0].length > 1))) {// В melodyMode берём первый найденный звук любой дорожки
			const findedTrack = activeSounds.find(trackSounds => trackSounds.length > 0);
			if (findedTrack !== void 0) activeSounds = [[findedTrack[findedTrack.length - 1]]];
		} 
		
		const summedSounds = []; 
		const soundLoads = [];
		const ap = [0, 0];
		//          b  a
		//Или тут обновлять счетчики
		for (let trackActiveSounds of activeSounds) {	
			for (let i = 0; i < trackActiveSounds.length; i++) {	
				const soundCode = +trackActiveSounds[i];
				if (this.doublesCheckBox.checked && summedSounds.includes(soundCode)) continue;
				const soundLoad = this.systemLoads[soundCode];
				ap[+(soundLoad > 0)] += soundLoad;
				summedSounds.push(soundCode);
				soundLoads.push(soundLoad);
			}
		}
		//Возврат отфильтрованных на dbl flatted массива звуков
		return [ap, soundLoads, summedSounds];
	}
}

function addSign(num) {return `${num > 0 ? '+' : ''}${num}`;}

function setCirclesColor(circles, ap) {
	circles[0].style.backgroundColor = `rgba(0, 0, 255, ${1 / 21 * Math.abs(ap[0])})`;
	circles[1].style.backgroundColor = `rgba(255, 0, 0, ${1 / 21 * ap[1]})`;
}

function onChangeKey(event) {
	const newKey = +(event.detail !== void 0 ? event.detail : event.target.value !== '' ? event.target.value : 1); 
	//newKey = countOfFifth от C или тональный центр
	
	this.notesNames.length = 0;
	getNotesNamesInFifthView(newKey, this.notesNames);
	
	const optionElements = this.notesNames.reduceRight((accum, note, i) => 
		accum += `<option ${i == 6 ? 'selected ' : ''}value="${getCountOfFifthByKey(note)}">${note}</option>`, '');
	
	this.key.innerHTML = '';
	this.key.innerHTML = optionElements;
	
	this.systemLoads.length = 0;
	getSystemLoadsInMidiCodeView(getMidiCodeByCountOfFifth(newKey), this.systemLoads, this.triton6b.checked);
	
	if (this.id === void 0)
		document.getElementById('channels').querySelectorAll('p > piano-roll').forEach(p => p.setColors(this.systemLoads));
	else if (this.prevKey !== null){ //Если меняем внутри анализатора - сдвинуть ось на разницу с новой тональностью
		const keyDelta = (+this.key.value) - this.prevKey; // <0 если новая тональность минорнее
		if (keyDelta !== 0) {
			this.expand(keyDelta < 0 ? [keyDelta, 0] : [0, keyDelta]);
			const cells = this.table.tHead.rows[0].cells;
			const tCellIndex = Array.prototype.findIndex.call(cells, cell => cell.textContent === '0'); //индекс тоники
			const newTIndex = tCellIndex + keyDelta * -1;
			
			for (const cell of cells) {
				let newVal = newTIndex - cell.cellIndex;
				if (newVal < 1) newVal = Math.abs(newVal);
				cell.textContent = newVal;
			}
		}
	}
	
	this.soundNames.length = 0;
	const res = getNotesNamesInCodeView(newKey, this.systemLoads);
	this.soundNames.push(...res);
	
	this.prevKey = newKey;
	
	return newKey;
}

function addAnalyzer() {
	const wrap = document.createElement('div');
	wrap.classList.add('dopWrap');
	wrapperAnalyzers.append(wrap);
	wrapperAnalyzers.append(document.createElement('hr'));

	const lastNumOfAnalyzer = analyzers[analyzers.length - 1] == undefined 
		? -1 : analyzers[analyzers.length - 1].id;
	const a = new Analyzer(lastNumOfAnalyzer+1, wrap, +key.value, [], triton6b.checked);
	analyzers.push(a);
	if (started) a.start();
	return a;
}

addAnalyzerBtn.onclick = addAnalyzer;

addAllAnalyzerBtn.onclick = () => {
	for (let sounds of tracksActiveSounds.values()) {
		let a = addAnalyzer();
		a.tracksActiveSounds.push(sounds);
	};
}
//todo
Object.defineProperty(window, "bpm", {
	get() {
		return bpmVal;
	},
	set(val) {
		//Тут мб флоат и из за точности они не равны
		if (val === bpmVal) return;
		bpmVal = val;
		bpmEl.value = val;
		bpmEl.dispatchEvent(new Event('change'));
	}
});

bpmEl.onchange = e => {
	const val = +e.target.value;
	tempOf4 = 60000 / val;
	bpmVal = val; 
	setFullTact();
}
//Три сущности bpm: bpm, bpmVal и bpmEl
document.body.onmousedown = e => {
	if (e.target.tagName == "HR") {
		toResize = e.target.id == "ifaceresize" ? e.target.nextElementSibling : e.target.previousElementSibling.lastElementChild.children[1];
		rectClick = e.clientY;
	} /*else if (e.target.className === 'white' || e.target.className === 'black') {
		const pianoRoll = e.target.closest('piano-roll');
		const keyElement = e.target.className === 'white' ? e.target : e.target.parentElement;
		const midiCode = Array.from(pianoRoll.children).indexOf(keyElement);
		const select = pianoRoll.parentElement.querySelector('select');
		const trackIndex = select.id[select.id.length - 1];
		
		for (let track of tracksActiveSounds.entries()) {
			if (track[0].id === `${trackIndex}`) {
				const ee = trackMessageEmitters.get(track[1]);
				midiMessageHandler.call(track[0], track[1], ee, {data: [144, midiCode + 48]});
				keyElement.onmouseleave = keyElement.onmouseup = () => {
					midiMessageHandler.call(track[0], track[1], ee, {data: [128, midiCode + 48]});
					keyElement.onmouseleave = null;
				}
				return;
			}
		}	
	}*/
}
ifaceResizeValue.oninput = () => {
	const value = +ifaceResizeValue.value;
	if (!value || value < 0 || value > 100) return;

	wrapperAnalyzers.style.height = 100 - value + "%";
	document.querySelector('body > div.interface').style.height = value + "%"; 
	
}
document.body.onmousemove = e => {
	if (toResize && rectClick) {
		const newRect = e.clientY;
		const pxToResize = e.clientY-rectClick;
		if(!pxToResize) return;
		rectClick = e.clientY;
		
		if (toResize.classList[0] == "interface") {
			const analyzerWrap = toResize.parentElement.firstElementChild;
			const ifaceSize = parseInt(toResize.style.height) || 30;
			const analyzersSize = parseInt(analyzerWrap.style.height) || 70;
			
			const newa = analyzersSize + (pxToResize > 0 ? 1 : -1);
			const newi = ifaceSize + (pxToResize < 0 ? 1 : -1);
			
			toResize.style.height = newi + "%";
			analyzerWrap.style.height = newa + "%";
			ifaceResizeValue.value = newi;
		} else {
			const fSize = parseFloat(toResize.style.fontSize) || 1;
			toResize.style.fontSize = fSize + 0.007 * (pxToResize > 0 || -1) +'em';
		}
		
	}
}

document.body.onmouseup = e => {
	if (toResize === null) return;
	
	if (toResize.tagName[0] === 'T') {
		const result = analyzers.find(a => a.table === toResize);
		if (!result.showAll.checked) result.recalculateMaxTableRows();
	}
		
	toResize = null;
	rectClick = 0;
}

const codeEnvelopeMap = new Map();

async function f() {
	const midi = await navigator.requestMIDIAccess();
	//let outputs = Array.from(midi.outputs.values());
	let inputs = midi.inputs.values();
	
	if (midi.inputs.size === 0) inputs = [{}];
	
	let channelsSettings = null; 
	if (storage !== null)
		channelsSettings = JSON.parse(storage.channelSettings || '{}');
	
	for (let input of inputs) {
		const info = input.info = player.loader.instrumentInfo(0); 
		input.volume = 1;
		player.loader.startLoad(audioContext, info.url, info.variable);
		
		const element = addTrack(input);
		
		if (storage) {
			//Установка ручных настроек каналов
			const muteBtnEl = element.querySelector('.muteBtn');
			const soloBtnEl = element.querySelector('.soloBtn');
			const select = element.querySelector('select'); //instr
			const inputEl = element.querySelector('input'); //volume
			const indicator = element.querySelector('.indicator');
			const pianoRollEl = element.querySelector('piano-roll');
			
			//Если по двум соло кликнуть будет баг
			if (channelsSettings[input.name]) {
				const {muteBtn, soloBtn, instrument, volume, pianoRoll} = channelsSettings[input.name];
				if (soloBtn) soloBtnEl.click();
				
				if (muteBtn) {
					muteBtnEl.click();
					inputEl.dataset.prevVal = volume;
				} else if (volume){
					inputEl.value = volume, inputEl.dispatchEvent(new Event('input'))
				}
					
				if (instrument) {
					select.value = instrument;
					select.dispatchEvent(new Event('change'));
				}
							
				if (pianoRoll) indicator.click();
			} else
				storage.setItem('channelSettings', JSON.stringify(Object.assign(channelsSettings, {[input.name]: {}})));
			
			const saveSettings = action => () => {
				const obj = JSON.parse(storage.channelSettings);
				Object.assign(obj[input.name], action());
				storage.setItem('channelSettings', JSON.stringify(obj));
			}	
			
			//Добавление обработчиков изменений
			muteBtnEl.addEventListener('click', saveSettings(() => ({muteBtn: muteBtnEl.classList.contains('active'), soloBtn: soloBtnEl.classList.contains('active')})));
			soloBtnEl.addEventListener('click', saveSettings(() => ({soloBtn: soloBtnEl.classList.contains('active'), muteBtn: muteBtnEl.classList.contains('active')})));
			indicator.addEventListener('click', saveSettings(() => ({pianoRoll: pianoRollEl.style.display === ''})));
			select.addEventListener('change', saveSettings(() => ({instrument: select.value})));
			inputEl.addEventListener('input', saveSettings(() => ({volume: muteBtnEl.classList.contains('active') ? inputEl.dataset.prevVal : inputEl.value})));
		}
		
		//Добавление треков на кандидаты к сохранению настроек
		const tas = tracksActiveSounds.get(input);
		
		input.onmidimessage = 
			midiMessageHandler.bind(input, tas, trackMessageEmitters.get(tas));
	};
	
	const a = addAnalyzer();
	
	//Замьютить миди входы
	//const tracks = document.getElementById(`selins${tracksActiveSounds.size - 1}`);
	//if (tracks) tracks.parentElement.firstElementChild.click(); 
	
	a.tracksActiveSounds.push(...Array.from(tracksActiveSounds.values()));
	a.quantize.value = '0';
	a.quantize.dispatchEvent(new Event('change'));
	
	//Установка настроек пользователя для первого анализатора
	if (storage !== null) {
		const settingsChangeHandler = event => {
			if (event.target.tagName !== 'INPUT') return;
			const settings = JSON.parse(storage.settings || '{}');
			const checkbox = event.target;
			settings[checkbox.className] = checkbox.checked;
			storage.settings = JSON.stringify(settings);
		}
		const settingsElement = a.table.parentElement.querySelector('.innerSettings');
		const filtersElement = a.table.parentElement.querySelector('.innerFilters');
		settingsElement.onclick = settingsChangeHandler;
		filtersElement.onclick = settingsChangeHandler;
		
		const settings = JSON.parse(storage.settings || '{}');
		Object.keys(settings).forEach(key => {
			const checkbox = settingsElement.querySelector('.' + key) || filtersElement.querySelector('.' + key);
			if (!checkbox || checkbox.checked === settings[key]) return;
			checkbox.checked = settings[key];
			checkbox.dispatchEvent(new Event('change'));
		});
	}
	
	//outputs.forEach(output => allOutputs.push(output));
	//в идеале нужно давать возможность выбирать midi выход куда посылаются все midi события. пока программный синт
}

//Обработка колеса высоты тона midi клавиатуры
let lastPitchBendValue = 0;
function midiMessageHandler(activeS, ee, obj) { 
	const msg = obj.data;
	const midiCode = msg[1];
	const inp = codeEnvelopeMap.get(this);	//для песен this здесь {id:0,n:0,info{},volume...}
	
	if ((msg[0] === 128) || (msg[0] === 144 && msg[2] === 0)) {
		inp[midiCode].stop();
		delete inp[midiCode];
		const index = activeS.findIndex(s => s.pitch === midiCode);
		ee.dispatchEvent([128, activeS.splice(index, 1)[0]]);
	} else if (msg[0] === 144) {													
		const source = player.queueWaveTable(
			userInputAudioContext, userInput, window[this.info.variable], 
			0, midiCode, 100, this.volume / 7, []
		).audioBufferSourceNode;
		source.detune.value = lastPitchBendValue;
		inp[midiCode] = source;
		const val = new FloatSound(midiCode, source);
		activeS.push(val); 
		ee.dispatchEvent([msg[0], val]);
	} else if ([224,225,226].includes(msg[0])) {
		const pitchBendValue = getPitchBendValue(msg[2], simplifyMidiCode(msg[1]));
		for (const source of Object.values(inp)) source.detune.value = pitchBendValue;
		if (Math.round(pitchBendValue / 100) !== Math.round(lastPitchBendValue / 100)) 
			ee.dispatchEvent([]); 
		lastPitchBendValue = pitchBendValue;
	} else 
		return;
}

const keyCodeMap = ['A','Z','S','X','D','C','V','G','B','H','N','J','M','Q','2','W','3','E','R','5','T','6','Y','7','U','I','9','O','0','P'].map(key => (isFinite(key) ? 'Digit' : 'Key') + key);

document.addEventListener('keydown', event => {
	if (event.repeat) return;
	
	if (event.code == 'Space') {
		go(); 
		event.preventDefault();
	} else {
		const index = keyCodeMap.indexOf(event.code);
		if (index !== -1) {	//48 мидикод до малой октавы
			const firstTrack = tracksActiveSounds.entries().next().value;
			const ee = trackMessageEmitters.get(firstTrack[1]);
			midiMessageHandler.call(firstTrack[0], firstTrack[1], ee, {data: [144, index + 47]});
		}
	}
});

document.addEventListener('keyup', event => {
	if (event.repeat) return;
	
	const index = keyCodeMap.indexOf(event.code);
	
	if (index !== -1) {	//48 мидикод до малой октавы
		const firstTrack = tracksActiveSounds.entries().next().value;
		const ee = trackMessageEmitters.get(firstTrack[1]);
		midiMessageHandler.call(firstTrack[0], firstTrack[1], ee, {data: [128, index + 47]});
	}
});

bpm = 120;

f().catch(console.error);
