
import {Block} from './block';
import { LTypes } from './amp';

import { Deamp } from './deamp';

test("Creating a block", () => {
  const testHash = 'ABEF'; // placeholder for the test
  let block = new Block(LTypes.SIZE, "{ABEF}1045 17 64");

  expect(block.toString()).toEqual("<SIZE 16 7C74>{ABEF}1045 17 64");
});

const blockTestData = [
  "QST QST QST",
  "<FILE 29 A7F3>{568B}20190531220700:edcT.csv",
  "<SIZE 20 E0D5>{568B}146796 2294 64",
  "<DATA 75 23C5>{568B:1147}gC_Sb8&Nqa_Dh1}#QD_}/v};`M(8HvzO>qP2Jw&7$X_?@G&^U8~=:CbZ~%&C|]he",
  "<DATA 74 946C>{568B:359}qZ~D8C|@?|s#]H|7sb~g1iUI.Xs6|)>,!buHsC|1@|sp}zh4DM_s(!rinr>REM|Z",
  "<DATA 74 5A98>{568B:552}#v}&_M(d.E&uT8~(._~oe`c1Ix}aPD_=:_~${s(v#v(Xs<|(h6.E8NCC|:[|s/qk",
  "<DATA 75 B4D2>{568B:1364}Nw)Xs&|(h=&#$Z_ICkDe>%a6TK&#$,KC|u9M>J&NqkhK8fl<~>NQ>REJ9v}#`s(.",
  "<DATA 74 BB43>{568B:261}}${s(Vs.9Y(7~4ZP&!TY_^xG&_BD_8=PwZ~(8DJC&&Xqn%2_~O$(soqy}Wb8~s=v",
  "<DATA 75 CE16>{568B:1800}~N:_~qoNIC|`@XsT})>{&k1Z_n.H&IlD_%>v}#RJ_.&nKl>&,KqyXb~l2(Rz}Zi8",
  "<DATA 74 0682>{568B:551}=v}1T2qjq?Qg}C__*^4ZM|o<~;mG>REM|pCE>ivwqj_w>~]Lq(UI]M(oEy}UBO#P",
  "<DATA 75 1DE1>{568B:2056}}=G8~^Yi&nIa_%HI,f>}lat0<uW{Rfq,Qy>J&Uv_~2_M(@r?Qy>IVL|pCb~56#qi",
];

const testDataBlockOffset = 3;

const testBlockInfo = [
  {size: 75, num: 1147},
  {size: 74, num: 359},
  {size: 74, num: 552},
  {size: 75, num: 1364},
  {size: 74, num: 261},
  {size: 75, num: 1800},
  {size: 74, num: 551},
  {size: 75, num: 2056},
];

function getBlockFrom(buffer: string) : [Block, string] {
  let deamp = new Deamp();
  let block: Block | undefined;
  let bufferChars = buffer.split('');
  while (!block && bufferChars.length) {
    let char = bufferChars.shift() as string;
    block = deamp._processInput(char);
  }
  if (!block) {
    return [null as any, ""];
  }

  return [block, bufferChars.join('')];
}

test("Parsing blocks", () => {
  let buffer = blockTestData.join('\n');

  let block: Block|undefined;

  [block, buffer] = getBlockFrom(buffer);
  expect(block).toBeTruthy();

  expect(block.keyword).toEqual(LTypes.FILE);
  expect(block.data).toEqual("20190531220700:edcT.csv");
  expect(block.byteCount).toBe(29);
  expect(block.hash).toEqual("568B");

  [block, buffer] = getBlockFrom(buffer);
  expect(block).toBeTruthy();
  expect(block.keyword).toEqual("SIZE");
  expect(block.data).toEqual("146796 2294 64");
  expect(block.byteCount).toBe(20);
  expect(block.hash).toEqual("568B");

  for (let i = 0; i < testBlockInfo.length; ++i) {
    let blockInfo = testBlockInfo[i];
    let srcLine = blockTestData[testDataBlockOffset + i];
    let srcData = srcLine.substr(srcLine.indexOf('}') + 1);

    [block, buffer] = getBlockFrom(buffer);
    expect(block).toBeTruthy();

    expect(block.keyword).toEqual("DATA");
    expect(block.data).toEqual(srcData);
    expect(block.byteCount).toEqual(blockInfo.size);
    expect(block.blockNum).toEqual(blockInfo.num);
  } 
});

// TODO: Add tests to verify that bad blocks are rejected!

const badTestData = [
  "<DATA 75 23C5<FILE 29 A7F3>{568B}20190531220700:edcT.csvfdsafdsfdjklfdsafdsa",
  // (note that this block below is bad; I changed a character so the checksum would fail)
  "<DATA 75 CE16>{568B:1800}~N;_~qoNIC|`@XsT})>{&k1Z_n.H&IlD_%>v}#RJ_.&nKl>&,KqyXb~l2(Rz}Zi8",
  "<DATA 74 946C>{568B:359}qZ~D8C|@?|s#]H|7sb~g1iUI.Xs6|)>,!buHsC|1@|sp}zh4DM_s(!rinr>REM|Z",
  "<DATA 74 5A98>{568B:552}#v}&_M(d.E&uT8~(._~oe`c1Ix}aPD_=:_~${s(v#v(Xs<|(h6.E8NCC|:[|s/qk",
];

test("bad data handling", () => {
  let buffer = badTestData.join('\n');

  let block: Block|undefined;

  [block, buffer] = getBlockFrom(buffer);
  expect(block).toBeTruthy();
  expect(block.keyword).toEqual("FILE");
  expect(block.data).toEqual("20190531220700:edcT.csv");

  // It should not have any the bad partial data block and snag the next one
  [block, buffer] = getBlockFrom(buffer);
  expect(block).toBeTruthy();
  expect(block.blockNum).toEqual(359);
});
