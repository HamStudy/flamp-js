import { Deamp } from ".";

const FileFromFLAMP = [
  "<PROG 18 C801>{5258}FLAMP 2.2.04",
  "<FILE 38 3B54>{5258}20190530002949:prepemscripten.sh",
  "<ID 13 377E>{5258}KD7BBC ",
  "<SIZE 16 98D9>{5258}1217 20 64",
  "<DATA 72 8D82>{5258:1}[b64:start]AUxaTUEAAAd+XQAAAAQAEYhCRj30GGqmZ696n29paDCpTdym5RJOj",
  "<DATA 72 B9D8>{5258:2}YVds6ASwpSfFMT/NwdR4oZCOB4oqPC5SaeAOKyjVEa1hl0wWlWIYs87B8vuVE6x3",
  "<DATA 72 2B25>{5258:3}ywUPBPwGqXIuhWGPfhGx1cPl/ZZ7WUkVSkKdeFyqHFdjieS4jFTfN9xr8jH3aW43",
  "<DATA 72 8B56>{5258:4}C2AhvKbjIGYFQsCoJolHrYIasDkYEKXZ5kDE5u6kIGn8nRhIkjY//79o15p4s2wq",
  "<DATA 72 41F5>{5258:5}5/kP/pRwKg7sB2acT4lvOAFzEGwjAH06XKN8e/3jY13QgOr/iVrMcbhSeOAj5ai/",
  "<DATA 72 3E9C>{5258:6}oH2+bq/ENFEf37U7I7cq3aruuvHmBS7NaSTbdZEeMWebqkkIGQeWjYsJSm/wDVBn",
  "<DATA 72 FFF1>{5258:7}riwZi7ajEppvYEs3c4D0vsJpnlYSTBQXV7N/XzlEd12bSAChuT4p9U5ZeLRE8nAF",
  "<DATA 72 1486>{5258:8}k5InSsxWT8eARcRYdk71j9ujIr1lBmyM4ll5tFCoxXbW93JOZP7zVU+D4dnHsh1Z",
  "<DATA 72 71E9>{5258:9}/rMExM5SJYzEHvNNR6rX0wjx50VI/uVCvDpJ+7B9P2EVI22UbqAG6nqbqHKLXxlQ",
  "<DATA 73 36E1>{5258:10}tJQ8WL+uhry7Q4c4fF3R0w2MPnVGV8PdbOgw2rN0Kr1rZZYz3+yEKiS26naqX9dN",
  "<DATA 73 9829>{5258:11}ZDrwNBqO0OZ+vsGEeky+2bvpgVUTpHYrOMg0tujXYDtkrfNX3CFR5DVyXKDKJsrm",
  "<DATA 73 BDA9>{5258:12}3Toun0h/lfVowng4XNmUQfOaNQpkg48Y3vLsOB3If0zJGeco42FneaOsRr2Y0jRU",
  "<DATA 73 6B81>{5258:13}HXL1d3xZMIz2/GrgM8EpmxduAZPM9TCoA3odwlCS/tlhn0hXf01g1K9IAGpSHPu9",
  "<DATA 73 DBF5>{5258:14}un2B8ZX6CyWsxcUCz4EJCzjIITSE0EteH0Cj6ElW2BaqdLfxO9KURO8u/2/q+Mot",
  "<DATA 73 1EF1>{5258:15}CdSczQ/47XYzz230+oenAvBZwObkDeFx81lDKXrT8Ad3s8pG33t3Mar6J9D2mPXF",
  "<DATA 73 903A>{5258:16}UOoVab6k3nLYEWLzpm/awWiQDb2rfzUjC0/6S5vUX/JCDdUFF+yzr1YZWABkFrAM",
  "<DATA 73 AAF8>{5258:17}nVimd3CyF1umx8BWq0lWsAU8Wb7RWo9lre4++mr6mEOk0Y6jsaZUV3E9h4q7AtXd",
  "<DATA 73 BD56>{5258:18}YPrimvOZ3rfLKuYXm/E5Ba30mzAewZtJ9lOp8fanFKyb41TU08oVTdHwwWGD0aaY",
  "<DATA 73 23F6>{5258:19}bcM0dWoZJu6DaEgyIzOTRukyfnJRNdMs2l3WFN9R5kdgFkcrt3++zo=",
  "[b64:end",
  "<DATA 10 F5BD>{5258:20}]",
  "<CNTL 10 7185>{5258:EOF}",
  "<CNTL 10 D189>{5258:EOT}",
];

test("inputBuffer ignore junk chars", () => {
  let deamp = new Deamp();

  deamp.ingestString("              fdsafdsafdsafdsaf dsaf dsa f     ");
  expect(deamp.__getInputBuffer()).toEqual("");
});

test("inputBuffer start paying attention after <", () => {
  let deamp = new Deamp();
  deamp.ingestString("      <         fdsfds");
  expect(deamp.__getInputBuffer()).toEqual("<         fdsfds");
});

test("inputBuffer discard potential block after too many chars", () => {
  let deamp = new Deamp();
  deamp.ingestString("      <         fdsfds                             ");
  expect(deamp.__getInputBuffer()).toEqual("");
});

test("inputBuffer discard after too many chars but keep interim", () => {
  let deamp = new Deamp();
  deamp.ingestString("      <         fdsfds      <DATA         ");
  expect(deamp.__getInputBuffer()).toEqual("<DATA         ");
});

test("inputBuffer bail on malformed tag", () => {
  let deamp = new Deamp();
  deamp.ingestString("  <SIZE ^^ tingy>");
  expect(deamp.__getInputBuffer()).toEqual("");
});

test("inputBuffer bail on invalid tag", () => {
  let deamp = new Deamp();
  deamp.ingestString("  <CHIC 23 AB34>");
  expect(deamp.__getInputBuffer()).toEqual("");
});
