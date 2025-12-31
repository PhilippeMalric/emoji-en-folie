import { TestBed } from '@angular/core/testing';

import { LabelResolver } from './label-resolver';

describe('LabelResolver', () => {
  let service: LabelResolver;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LabelResolver);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
