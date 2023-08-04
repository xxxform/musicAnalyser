// индекс - кол-во звуков лада. Индекс 0(5-5 = 0) - пентатоники, 2 - лады
const modes = [{//5 звуков
		'0,1,2,3,4': 'Мажорная пентатоника',            //ap0+10a CDEGA 
		'-1,0,1,2,3': 'Среднемажорная пентатоника',      //ap1+5a
		'-2,-1,0,1,2': 'Среднеминорная пентатоника',      //ap3+0a
		'-3,-2,-1,0,1': 'Минорная пентатоника',            //ap1+5b
		'-4,-3,-2,-1,0': 'Ультраминорная пентатоника'       //ap0+10b
	}, {//6 звуков
		'0,1,2,3,4,5': 'Сверхмажорная гексатоника', //ap0+15a
		'-1,0,1,2,3,4': 'Мажорная гексатоника',	     //ap1+9a
		'-2,-1,0,1,2,3': 'Гармоничная гексатоника',   //ap3+3a
		'-3,-2,-1,0,1,2': 'Минорная гексатоника',      //ap3+3b
		'-4,-3,-2,-1,0,1': 'Сверхминорная гексатоника', //ap1+9b
		'-5,-4,-3,-2,-1,0': 'Ультраминорная гексатоника' //ap0+15b
	}, {//7 звуков
		'0,1,2,3,4,5,6': 'Лидийский',      //ap0+21a
		'-1,0,1,2,3,4,5': 'Мажор',          //ap1+14a
		'-2,-1,0,1,2,3,4': 'Миксолидийский', //ap3+7a
		'-3,-2,-1,0,1,2,3': 'Дорийский',      //ap6+0a
		'-4,-3,-2,-1,0,1,2': 'Минор',          //ap3+7b
		'-5,-4,-3,-2,-1,0,1': 'Фригийский',     //ap1+14b
		'-6,-5,-4,-3,-2,-1,0': 'Локрийский',     //ap0+21b
		// Искусственные(Прерванная цепь квинт)
		'-4,-3,-1,0,1,2,5': 'Гармонический минор', //ap8+0a
		'-4,-1,0,1,2,4,5': 'Гармонический мажор',
		'-3,-1,0,1,2,3,5': 'Мелодический минор', //ap7+4a
		'-4,-2,-1,0,1,2,4': 'Мелодический мажор', //ap7+0a ...
		'-3,-2,0,1,2,3,6': 'Лидийский уравновешенный',
		'-4,-2,0,1,2,4,6': 'Лидийский мелодический(целотоновый)',
		'-4,0,1,2,4,5,6': 'Лидийский гармонический',
		'-5,-3,-1,0,1,3,5': 'Фригийский мелодический(целотоновый)',
		'-5,-4,-2,-1,0,1,4': 'Фригийский мажорированый(молдавский)',
		'-5,-2,0,1,3,4,6': 'Остро-спокойный мажор',
		'-5,0,1,3,4,5,6': 'Остро-интенсивный мажор',
		'-5,-4,-2,0,1,4,6': 'Острый мажоро-минор',
		'-5,-4,0,1,4,5,6': 'Острый мажор',
		'-5,-3,-2,0,1,3,6': 'Остро-спокойный минор',
		'-5,-4,-3,-2,0,1,6': 'Остро-интенсивный минор',
		'-5,-4,-3,0,1,5,6': 'Острый минор' //ap12
	}, {//8 звучные //+дезальтерированные звуки
		'-4,-3,-2,-1,0,1,2,5': 'Гармонический минор (8звучный)',//ap8+2b
		'-4,-1,0,1,2,3,4,5': 'Гармонический мажор (8звучный)',//
		'-3,-2,-1,0,1,2,3,4': 'Гармоничный восьмизвучный',
		'-4,-3,-2,-1,0,1,2,4': 'Минор(8звучный)',
		'-3,-1,0,1,2,3,4,5': 'Мажор(8звучный)',
		'-5,-4,-3,0,1,4,5,6': 'Вдвойне остро-гармонический'
	}, {//9 звуков и более уже не имеют особого значения тк свободны от ладовых ограничений
		'-4,-2,-1,0,1,2,3,4,5': 'Мелодический мажор(9звучный)',
		'-4,-3,-2,-1,0,1,2,3,5': 'Мелодический минор(9звучный)',
	}, {//10 звуков. 
		
	}, {//11 звуков
		
	}, {//12 звуков
		
	}, {
		'-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6': '13 звучная система'//ap21+0a
	}
]

const CountOfSoundSystem = 12; //12ти звучная система
//Обозначения midi   0   1    2   3    4   5   6    7   8    9   10   11
const notesNames = ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B']; 
//Строится по полутонам от центра системы(0). Всё равно пересоберётся а этот массив - пример для C

//       T        M       D
//[-3,5,-1,-6,2,-4,4,-2,6,1,-5,3] симметрия
const tonesLoadsMap = [0,-5,2,-3,4,-1,6,1,-4,3,-2,5];

//Пока на данном этапе нивелирована разница меж интервалами квартового и квинтового строения
const intervalNames = ['ч1','ч5','б2','м3','б3','м2','ум5','ув1','ув4','ув2','ум3','ув3'];
//						 0    1    2    3    4    5    6     7     8     9     10    11

/*Конвертирует число в семиричную систему звуков.
Вызов getKey(0 + 1) где 0 кол-во знаков при ключе даст тональный центр
Превышение разряда(разница 7) даст ув1 getKey(0) == F && getKey(7) == F# && getKey(-7) == Fb
Разница в 12 даст энгармонизм getKey(0) == F && getKey(12) == E# && getKey(-12) == Gbb*/
 
const arr = ['F','C','G','D','A','E','B']; //семиричный алфавит звуковой системы. 
const getOverflowIndex = (i, arrLength) => (i % arrLength + arrLength) % arrLength;
const getEl = (arr, i) => arr[getOverflowIndex(i, arr.length)];
/*getEl Доступ и по отрицательным индексам(с конца массива)
Получает номер звука в квинтовой цепи относительно F(начала алфавита). Возвращает название звука*/
function getKey(n) {
	const rankReplacer = n < 0 ? 'b' : '#';
	const nIn7 = Math.abs(n).toString(7); //Число в семеричном представлении
	const ranks = Math.abs(Math.floor(n / 7)); //Сколько разрядов
	const last = getEl(arr, nIn7[nIn7.length-1] * (n < 0 ? -1 : 1)); 
	//Последний символ семеричного представления в алфавитном виде
	
	return last + rankReplacer.repeat(ranks);
}

const sum = arr => arr.reduce((sum, i) => sum + i, 0);
//Принимает колористические нагрузки звуков и возвращает их линейную сумму в а и b виде
// [-6,-5,-4,-3,-2,-1,1,2,3,4,5,6]; 
// В альфном виде отрицательные(бетные) нагрузки увеличиваются на 1
// В бетном виде положительные нагрузки меняют знак как и отрицательные и положительные увеличиваются на 1
// Можно ли вычислить зная только ap(не зная конкретных звуков) линейную разницу
function getLinearSumByLoads(sounds) { //Эта функция намного быстрее
	return sounds.reduce((lin, load) => {
		return lin + load;
	}, 0);
}

function getIntervalsByLoads(loads) {
	loads = Array.from(loads);
	const intervals = [];
	loads.sort((...args) => {
		const [current, next] = args;
		intervals.push(intervalNames[Math.abs(current - next)]);
	});
	
	return [intervals, loads];
}

function getApString(ap) {
	const outLoad = ap[0] + ap[1];
	return `ap${Math.abs(ap[+(outLoad < 0)])}+${Math.abs(outLoad)}${outLoad > -1 ? 'a' : 'b'}`
}

/* Если вызывать getKey для loadsMap можно построить квинтовую цепь
 loadsMap.map(v => getKey(v+1 + (v < 0 ? 1 : 0)))  даст
 ["Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#"]
 Разница между двумя n характеризует lin интервала*/
 function getPitchBendValue(integer, floatPoint) {
	 return Math.round((((integer - 64) + (1 / 128) * floatPoint) * (2 / 64)) * 100)
 }

//Функция обратная getKey. Упростил
function getCountOfFifthByKey(key) {
	key = key.toUpperCase();
	const countOfAlt = key.length - 1;
	const sign = key[1] == 'B' ? -1 : 1;
	const ranks = countOfAlt * 7 * (sign == '-1' ? -1 : 1);
	let index = arr[`${sign == -1 ? 'lastI' : 'i'}ndexOf`](key[0]);
	
	return ranks + index;
}

function simplifyMidiCode(code) {
	return getOverflowIndex(code, 12);
}

//Cводит counthOfFifth к midiCode т.е получает энгармонизмы
//Cтроит квинты(* 7) по клавишам от 0(midi код C) до n; f(-7) == 11(Cb) и f(5) == 11(B)
function getMidiCodeByCountOfFifth(countOfFifths) {
	return getOverflowIndex((countOfFifths - 1) * 7, 12);
}

//           midiCodes    0  1 2  3 4  5 6 7  8 9 10 11
//const tonesLoadsMap = [-1,-6,2,-4,4,-2,6,1,-5,3,-3,5];
//Принимает midiCode тоники системы
//Вернёт массив где индекс - midiCode а значение - нагрузка этого звука в системе midiCode
function getSystemLoadsInMidiCodeView(midiCode, systemLoads = []) {
	//midiCode это смещение для массива tonesLoadsMap.
	const sysMidiCodes = getSoundCodes(midiCode); //Вернёт для 7 [7,  8,9,10,11,0,1,2, 3,4, 5,6]
		      //что соответствует tonesLoadsMap 				 [-1,-6,2,-4,4,-2,6,1,-5,3,-3,5]
	for (let i = 0; i < CountOfSoundSystem; i++) //CountOfSoundSystem здесь кол-во клавиш
		systemLoads.push(tonesLoadsMap[sysMidiCodes.indexOf(i)]);
		//Найдёт нагрузку каждого midiCode(i) в текущей системе
		//notesNames.push(getOverflowIndex(i + midiCode, 12));
	return systemLoads;
}

//Собирает notesNames в виде tonesLoadsMap. n-тональный центр
function getNotesNamesInCodeView(key, sysLoads) {
	return sysLoads.map(load => {
		return getKey(load + key);
	});
}

const loadsMap = [-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6]; 

function reduceLoadsMap(handler, arr = []) {
	return loadsMap.reduce((result, val) => {
		const value = handler(val);
		result.push(value);
		return result;
	}, arr);
}
//Собирает notesNames в виде квинтовой цепи по принятой тонике
function getNotesNamesInFifthView(n, notesNames = []) {
	return reduceLoadsMap(countOfFifths => {
		return getKey(countOfFifths + n);
	}, notesNames);
}

//Возвращает отрезок midi кодов от тоники n(числу квинт от C)
//Возвращает для 0(C) [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
//Для G(1) [7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5, 6]
function getSoundCodesByN(n, notesNames = []) {//n - countOfFifth
	return getSoundCodes(getMidiCodeByCountOfFifth(n), nodeNames);
}

function getSoundCodes(midiCode, notesNames = []) {
	for (let i = 0; i < CountOfSoundSystem; i++) 
		notesNames.push(getOverflowIndex(i + midiCode, 12));
	
	return notesNames;
}

function getPossibleKeyByDescription(signOfKey, scale) {
	return signOfKey + (!scale ? 0 : 3) + 1;
}

//Не используется
// Возвращает массив где значение - midi код а его индекс - ссылка на loadsMap для получения нагрузок в данной CountOfSoundSystem звучной системе n где n0 система C
//Для 0(С) вернёт [1, 8, 3, 10, 5, 0, 7, 2, 9, 4, 11, 6] для сопоставления с
//loadsMap        [-6,-5,-4,-3,-2,-1, 1, 2, 3, 4, 5,  6];  функция не используется

function getSystemLoads(n, systemLoads = []) {
	return reduceLoadsMap(countOfFifths => {
		return getMidiCodeByCountOfFifth(countOfFifths + n);
	}, systemLoads);
}

function getPossibleKeyNameByDescription(signOfKey, scale) {
	return getKey(signOfKey + 1 + (!scale ? 0 : 3)); 
}
