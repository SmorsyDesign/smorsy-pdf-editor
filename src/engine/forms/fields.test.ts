import { describe, expect, it } from 'vitest';
import { fieldFromWidget, hasAnswer, isFillable, type WidgetData } from './fields';

const identity = (rect: readonly number[]) => rect;
const widget = (data: Partial<WidgetData>): WidgetData => ({
  subtype: 'Widget',
  fieldName: 'name',
  rect: [10, 20, 110, 40],
  ...data,
});
const read = (data: Partial<WidgetData>) => fieldFromWidget(widget(data), 1, identity);

describe('fieldFromWidget', () => {
  it('reads a text field', () => {
    const field = read({ fieldType: 'Tx', fieldValue: 'Mara', maxLen: 10, multiLine: true });
    expect(field).toMatchObject({
      kind: 'text',
      value: 'Mara',
      maxLength: 10,
      multiline: true,
      rect: { x: 10, y: 20, width: 100, height: 20 },
    });
  });

  it('reads a checkbox', () => {
    expect(
      read({ fieldType: 'Btn', checkBox: true, fieldValue: 'Off', exportValue: 'Yes' }),
    ).toMatchObject({ kind: 'checkbox', value: false });
    expect(
      read({ fieldType: 'Btn', checkBox: true, fieldValue: 'Yes', exportValue: 'Yes' }),
    ).toMatchObject({ kind: 'checkbox', value: true });
  });

  it('reads a radio button, with the value this one stands for', () => {
    expect(
      read({ fieldType: 'Btn', radioButton: true, fieldValue: 'no', buttonValue: 'yes' }),
    ).toMatchObject({ kind: 'radio', value: 'no', onValue: 'yes' });
    expect(
      read({ fieldType: 'Btn', radioButton: true, fieldValue: null, buttonValue: 'yes' }),
    ).toMatchObject({ value: '' });
  });

  const options = [
    { exportValue: 'a', displayValue: 'Apple' },
    { exportValue: 'b', displayValue: 'Banana' },
  ];

  it('reads a dropdown, in the words the person reads', () => {
    expect(read({ fieldType: 'Ch', combo: true, options, fieldValue: ['b'] })).toMatchObject({
      kind: 'dropdown',
      value: 'Banana',
      options: ['Apple', 'Banana'],
    });
  });

  it('reads a list with several chosen', () => {
    expect(
      read({ fieldType: 'Ch', multiSelect: true, options, fieldValue: ['a', 'b'] }),
    ).toMatchObject({ kind: 'list', value: ['Apple', 'Banana'] });
  });

  it('reads signature fields and a form’s own buttons', () => {
    expect(read({ fieldType: 'Sig' })?.kind).toBe('signature');
    expect(read({ fieldType: 'Btn', pushButton: true })?.kind).toBe('button');
  });

  it('prefers the file’s own description for what to call a field', () => {
    expect(read({ fieldType: 'Tx' })?.label).toBe('Name');
    expect(read({ fieldType: 'Tx', fieldName: 'student.first_name[0]' })?.label).toBe(
      'Student first name',
    );
    expect(read({ fieldType: 'Tx', alternativeText: 'Your full name' })?.label).toBe(
      'Your full name',
    );
  });

  it('puts the field where the page is displayed', () => {
    const turned = fieldFromWidget(
      widget({ fieldType: 'Tx' }),
      2,
      ([a = 0, b = 0, c = 0, d = 0]) => [b, a, d, c],
    );
    expect(turned?.rect).toEqual({ x: 20, y: 10, width: 20, height: 100 });
    expect(turned?.pageNumber).toBe(2);
  });

  it('skips what isn’t a usable field', () => {
    expect(read({ subtype: 'Link' })).toBeNull();
    expect(read({ fieldType: 'Tx', hidden: true })).toBeNull();
    expect(read({ fieldType: 'Unknown' })).toBeNull();
    expect(read({ fieldType: 'Tx', fieldName: '' })).toBeNull();
  });
});

describe('hasAnswer', () => {
  it('knows when each kind of value counts as answered', () => {
    expect(hasAnswer('x')).toBe(true);
    expect(hasAnswer('')).toBe(false);
    expect(hasAnswer(true)).toBe(true);
    expect(hasAnswer(false)).toBe(false);
    expect(hasAnswer(['x'])).toBe(true);
    expect(hasAnswer([])).toBe(false);
  });
});

describe('isFillable', () => {
  it('leaves out read-only fields and a form’s own buttons', () => {
    const fieldOf = (data: Partial<WidgetData>) => {
      const field = read(data);
      if (!field) throw new Error('Not a field.');
      return field;
    };
    expect(isFillable(fieldOf({ fieldType: 'Tx' }))).toBe(true);
    expect(isFillable(fieldOf({ fieldType: 'Tx', readOnly: true }))).toBe(false);
    expect(isFillable(fieldOf({ fieldType: 'Btn', pushButton: true }))).toBe(false);
  });
});
