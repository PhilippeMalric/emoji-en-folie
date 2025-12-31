import { TestBed } from '@angular/core/testing';

import { EmojiCatalog } from './emoji-catalog';

describe('EmojiCatalog', () => {
  let service: EmojiCatalog;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EmojiCatalog);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
