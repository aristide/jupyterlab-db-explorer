import { style, keyframes } from 'typestyle';

// Dialog width helper used by ask_pass.tsx (password prompt modal).
export const dlgStyle300 = style({
  width: 300,
  $nest: {
    '& input': {
      width: '100%'
    }
  }
});

// Loading spinner — consumed by loading.tsx for the password / busy modal.
// The tree and form use their own d4n-css spinners; this remains for the
// stand-alone Loading widget.
export const spinStyle = keyframes({
  '100%': {
    transform: 'rotate(360deg)'
  }
});

export const loadingStyle = style({
  boxSizing: 'border-box',
  width: '12px',
  height: '12px',
  borderRadius: '100%',
  border: '2px solid rgba(0, 0, 0, 0.4)',
  borderTopColor: '#FFF',
  animationName: spinStyle,
  animationDuration: '1s',
  animationIterationCount: 'infinite',
  animationTimingFunction: 'linear',
  marginLeft: 10,
  marginRight: 10,
  marginTop: 6
});
