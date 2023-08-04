describe("Module", function() {
describe("Analyzer", function() {

  it("getAp", function() {
	const testCtx = {
		melodyMode: {checked: false},
		doublesCheckBox: {checked: false},
		systemLoads: [-1,-6,2,-4,4,-2,6,1,-5,3,-3,5]
	};
	const arg = [[0,7]];
	const result = Analyzer.prototype.getAp.call(testCtx, arg);
    expect(result).to.deep.equal([[-1, 1],[-1, 1],[0, 7]]);
  });
  
  it("getApByShowMode", function() {
	const func = Analyzer.prototype.getApByShowMode;

	let ctx = {
		outCheckBox: {checked: true},
		apCheckBox: {checked: false},
		outIntCheckBox: {checked: false},
	};
    expect(func.call(ctx, [-1, 2], [-1, 2])).to.deep.equal([-1, 1]);
	ctx = {
		outCheckBox: {checked: false},
		apCheckBox: {checked: true},
		outIntCheckBox: {checked: false},
	}
	expect(func.call(ctx, [-1, 2], [-1, 2])).to.deep.equal([0, 1]);
	ctx = {
		outCheckBox: {checked: false},
		apCheckBox: {checked: false},
		outIntCheckBox: {checked: true},
	}
	expect(func.call(ctx, [-1, 5], [-1, 2, 3])).to.deep.equal([-1, 3]);
  });
  
  it("drawData", function() { 
	const testCtx = {
		table: {
			rows: {'0':{cells:{length:2}}},
			tFoot: {rows: [{cells: [{
				textContent: 'G',
				previousElementSibling: {textContent: ''}
			}, {
				textContent: 'C',
				previousElementSibling: {textContent: ''}
			}]}]},
			tHead: {rows: [{cells: [{
				textContent: '1',
				previousElementSibling: {textContent: 'C'}
			}, {
				textContent: '0',
				previousElementSibling: {textContent: 'C'}
			}]}]}
		},
		showNotes: {checked: true},
		prevQuantize: '0',
		notesNames: ["Gb","Db","Ab","Eb","Bb","F","C","G","D","A","E","B","F#"]
	};
	const arg = [[0,1], [0,1], true];
	const result = Analyzer.prototype.drawData.call(testCtx, ...arg);
	expect(result.textContent).to.equal('GC');
	expect(result.cells.length).to.equal(2);
  });

  it("expand", function() {
	const table = document.createElement('table');
	const tHeadTr = table.createTHead().insertRow();
	const tr = table.insertRow();
	tHeadTr.insertCell().textContent = '1';
	tHeadTr.insertCell().textContent = '1';
	tr.insertCell(); tr.insertCell();
	
	const testCtx = { table };
	const arg = [-2,2];
	Analyzer.prototype.expand.call(testCtx, arg);
	expect(table.rows[0].cells[0].textContent).to.equal('2');
	expect(table.rows[1].cells.length).to.equal(4);
  });
  
  it("collapseTable", function() {
	const table = document.createElement('table');
	const tBody = table.createTBody();
	const tHeadTr = table.createTHead().insertRow();
	tHeadTr.insertCell().textContent = '1';
	tHeadTr.insertCell().textContent = '1';
	tHeadTr.insertCell().textContent = '2';
	const tr1 = tBody.insertRow();
	tr1.insertCell();
	tr1.insertCell(); 
	tr1.insertCell();
	const testCtx = { table };
	Analyzer.prototype.collapseTable.call(testCtx);
	expect(table.rows[0].cells.length).to.equal(2);
	expect(table.rows[1].cells.length).to.equal(2);
  });
  
  it("clear", function() {
	const table = document.createElement('table');
	const tBody = table.createTBody();
	const tFoot = table.createTFoot();
	const tHeadTr = table.createTHead().insertRow();
	tHeadTr.insertCell().textContent = '1';
	tHeadTr.insertCell().textContent = '0';
	tHeadTr.insertCell().textContent = '1';
	const tr0 = tBody.insertRow();
	tr0.insertCell();
	tr0.insertCell(); 
	tr0.insertCell();
	const tr1 = tBody.insertRow();
	tr1.insertCell();
	tr1.insertCell(); 
	tr1.insertCell();
	const tr2 = tFoot.insertRow();
	tr2.insertCell();
	tr2.insertCell(); 
	tr2.insertCell();
	let clickFlag = false;
	
	const testCtx = { 
		table, 
		history: [], 
		aModeAccumSounds: [],  
		notesNames: ['0', '1', '2', '3', '4', 'C', 'C'], 
		counters: { querySelector: () => ({click: () => clickFlag = true}) }
	};
	Analyzer.prototype.clear.call(testCtx);
	
	expect(tBody.rows.length).to.equal(1);
	expect(tBody.rows[0].cells.length).to.equal(1);
	expect(table.tHead.rows[0].cells.length).to.equal(1);
	expect(table.tFoot.rows[0].cells.length).to.equal(1);
	expect(table.tFoot.rows[0].textContent).to.equal('C');
	expect(table.tHead.rows[0].textContent).to.equal('0');
	expect(clickFlag).to.equal(true);
  });
  
  it("midiMessageHandler", function() {
	const func = Analyzer.prototype.midiMessageHandler;
	const True = {checked: true};
	const False = {checked: false};

	let tickResult = null;
	let ctx = {
		aModeAccumSounds: [],
		prevQuantize: '0',
		tracksActiveSounds: [[]],
		accordMode: True,
		melodyMode: True,
		noKeyUp: True,
		tick: result => tickResult = result
	};
	
	func.call(ctx, [144, 1]);
    expect(ctx.aModeAccumSounds[0]).to.equal(1);
	func.call(ctx, [128, 1]);
	expect(tickResult[0]).to.equal(ctx.aModeAccumSounds);
	expect(ctx.aModeAccumSounds.length).to.equal(0);
	
	ctx.accordMode = False;
	func.call(ctx, [144, 2]);
	expect(tickResult[0][0]).to.equal(2);
	
	ctx.melodyMode = False;
	func.call(ctx, [144, 2]);
	expect(tickResult).to.equal(undefined);
  });
  
});

describe("Emitter", function() {
	let emitter = null;
	let callbackFlag = false;
	let callbackData = null;
	const func = data => {
		callbackFlag = true; 
		callbackData = data;
	}
	
	it("construct", function() {
		emitter = new Emitter();
		expect(emitter instanceof Emitter).to.equal(true);
		expect(emitter.callbacks instanceof Array).to.equal(true);
	});
	
	it("subscribe", function() {
		emitter.addEventListener(func);
		expect(emitter.callbacks[0]).to.equal(func);
	});
	
	it("dispatchEvent", function() {
		emitter.dispatchEvent(1);
		expect(callbackFlag).to.equal(true);
		expect(callbackData).to.equal(1);
	});
	
	it("unsubscribe", function() {
		emitter.removeEventListener(func);
		expect(emitter.callbacks.length).to.equal(0);
	});
});

describe("FloatSound", function() {
	let floatSound = null;
	const source = {
		detune: {
			value: 0
		}
	};
	
	it("construct", function() {
		floatSound = new FloatSound(1, source);
		expect(floatSound instanceof FloatSound).to.equal(true);
		expect(floatSound instanceof Number).to.equal(true);
		expect(+floatSound).to.equal(1);
	});
	
	it("changeTone", function() {
		source.detune.value = 100;
		expect(+floatSound).to.equal(2);
	});
});

describe("musicFunctions", function() {
	it("getKey", function() {
		const notes = ['Bb','F','C','G','D','A','E','B','F#'];
		const result = notes.every((v, i) => v === getKey(i - 1));
		expect(result).to.equal(true);
	});
	it("getCountOfFifthByKey", function() {
		const notes = ['Bb','F','C','G','D','A','E','B','F#'];
		const result = notes.every((v, i) => i - 1 === getCountOfFifthByKey(v));
		expect(result).to.equal(true);
	});
	it("getSystemLoadsInMidiCodeView", function() { 
		const result = getSystemLoadsInMidiCodeView(0);
		expect(result).to.deep.equal([0,-5,2,-3,4,-1,6,1,-4,3,-2,5]);
	});
	it("getNotesNamesInFifthView", function() { 
		const result = getNotesNamesInFifthView(3);
		expect(result).to.deep.equal(["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#", "G#"]);
	});
	it("getIntervalsByLoads", function() { 
		expect(getIntervalsByLoads([0, 4, 1])[0]).to.deep.equal(['б3','м3']);
		expect(getIntervalsByLoads([4, 1, 0])[0]).to.deep.equal(['м3','ч5']);
		expect(getIntervalsByLoads([1, 0, 4])[0]).to.deep.equal(['ч5','б3']);
	});
	it("getLinearSumByLoads", function() {
		expect(getLinearSumByLoads([-1, -4, 1])).to.deep.equal(-4);
		expect(getLinearSumByLoads([-1, 4, 1])).to.deep.equal(4);
	});
	it("getSoundCodes", function() {
		expect(getSoundCodes(4)).to.deep.equal([4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2, 3]);
	});
});
});

describe("Integration", function() {
	it("PianoRoll-Emitter-Sound/FloatSound", function() {
		const div = document.createElement('div');
		div.innerHTML = '<piano-roll></piano-roll>';
		const piano = div.querySelector('piano-roll');
		const midiEmitter = new Emitter();
		piano.emitter = midiEmitter;
		
		midiEmitter.dispatchEvent([144, 0]);
		expect(piano.children[0].textContent).to.equal('C');
		midiEmitter.dispatchEvent([128, 0]);
		expect(piano.children[0].textContent).to.equal('');
		
		const source = {
			detune: {
				value: 0
			}
		};
		const floatSound = new FloatSound(0, source);
		midiEmitter.dispatchEvent([144, floatSound]);
		expect(piano.children[0].textContent).to.equal('C');
		source.detune.value = 100;
		midiEmitter.dispatchEvent([]);
		expect(piano.children[0].textContent).to.equal('');
		expect(piano.children[1].textContent).to.equal('Db');
		midiEmitter.dispatchEvent([128, floatSound]);
		expect(piano.children[0].textContent).to.equal('');
		expect(piano.children[1].textContent).to.equal('');
	});
	
	it("Analyzer-Emitter-Sound/FloatSound", function() { 
		const wrap = document.createElement('div');
		const analyzer = new Analyzer(0, wrap, 1); 
		
		let currentRow = analyzer.table.tBodies[0].rows[0];
		expect(currentRow.className).to.equal('f');
		expect(currentRow.cells.length).to.equal(1);
		const activeSounds = [0, 2];
		analyzer.prevQuantize = '0';
		analyzer.tracksActiveSounds.push(activeSounds);

		const midiEmitter = new Emitter();
		midiEmitter.addEventListener(analyzer.midiMessageHandler);
		midiEmitter.dispatchEvent([]);
		expect(analyzer.table.tBodies[0].rows[1]).to.equal(currentRow);
		
		currentRow = analyzer.table.tBodies[0].rows[0];
		expect(currentRow.cells[0].classList.contains('load')).to.equal(true);
		expect(currentRow.cells[1].classList.contains('outCell')).to.equal(true);
		expect(currentRow.cells[2].classList.contains('centerCell')).to.equal(true);
		expect(currentRow.textContent).to.equal('DC');
		
		activeSounds.length = 0;
		midiEmitter.dispatchEvent([]);
		expect(analyzer.table.tBodies[0].rows[1]).to.equal(currentRow);
		currentRow = analyzer.table.tBodies[0].rows[0];
		expect(Array.from(currentRow.cells).every(({className}) => 
			className === 'centerCell apCell' || className === '')).to.equal(true);
		expect(currentRow.textContent).to.equal('');
		
		const source = {
			detune: {
				value: 0
			}
		};
		activeSounds.push(new FloatSound(0, source));
		midiEmitter.dispatchEvent([]);
		expect(analyzer.table.tBodies[0].rows[0].textContent).to.equal('C');
		source.detune.value = 100;
		midiEmitter.dispatchEvent([]);
		expect(analyzer.table.tBodies[0].rows[0].textContent).to.equal('Db');
	});
});