import {
  CheckAuthStatusToolInstance,
  GenerateAppealToolInstance,
  GetAppealPdfToolInstance,
} from "../../tools/index";

describe("Tools index", () => {
  it("exports CheckAuthStatusToolInstance", () => {
    expect(CheckAuthStatusToolInstance).toBeDefined();
  });

  it("exports GenerateAppealToolInstance", () => {
    expect(GenerateAppealToolInstance).toBeDefined();
  });

  it("exports GetAppealPdfToolInstance", () => {
    expect(GetAppealPdfToolInstance).toBeDefined();
  });
});
