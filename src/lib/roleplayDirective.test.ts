import { describe, it, expect } from 'vitest';
import { DEFAULT_ROLEPLAY_DIRECTIVE, LEGACY_ROLEPLAY_DIRECTIVE, upgradeRoleplayDirective } from './roleplayDirective.mjs';
import { interactiveScenePrompt } from './currentTurnRules.mjs';

describe('inherited roleplay directive compatibility', () => {
  it('upgrades the retired factory directive received from an already open client', () => {
    const prompt = interactiveScenePrompt({character_role:'Elena, arquitecta',player_role:'Cliente'},0,true,{directive:LEGACY_ROLEPLAY_DIRECTIVE});
    expect(prompt).toContain(DEFAULT_ROLEPLAY_DIRECTIVE);
    expect(prompt).not.toContain('VERSION 5 MASTER');
    expect(upgradeRoleplayDirective(LEGACY_ROLEPLAY_DIRECTIVE.replace(/\n/g,'\r\n'))).toBe(DEFAULT_ROLEPLAY_DIRECTIVE);
  });
  it('preserves a user edit instead of resetting it as a factory setting', () => {
    const customized = LEGACY_ROLEPLAY_DIRECTIVE + '\nMi personaje habla despacio y con calma.';
    expect(upgradeRoleplayDirective(customized)).toBe(customized);
    expect(upgradeRoleplayDirective('Responde con formalidad.')).toBe('Responde con formalidad.');
  });
});
