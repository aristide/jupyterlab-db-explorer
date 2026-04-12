import { style, keyframes } from 'typestyle';

export const tbStyle = style({
  padding: 10,
  paddingBottom: 0
});

export const activeStyle = style({
  color: 'var(--jp-ui-inverse-font-color1)',
  background: 'var(--jp-brand-color1)'
});

export const listStyle = style({
  listStyleType: 'none',
  margin: 0,
  padding: 0,
  height: 'calc(100% - 120px)',
  overflow: 'auto',
  $nest: {
    '&>li': {
      marginTop: 2,
      padding: 4,
      paddingLeft: 10,
      paddingRight: 10,
      userSelect: 'none',
      $nest: {
        [`&:hover:not(.${activeStyle})`]: {
          background: 'var(--jp-layout-color2)'
        },

        '&:active': {
          backgroundColor: '#1072ae99'
        }
      }
    },
    '&>li>span:first-child': {
      marginRight: 5,
      verticalAlign: 'text-top'
    },
    '&>li>.name': {
      marginRight: 5,
      fontWeight: 'bold',
      maxWidth: '80%',
      overflow: 'hidden',
      display: 'inline-flex',
      textOverflow: 'ellipsis'
    },
    '&>li>.memo': {
      marginRight: 5
    },

    [`&>li:not(.${activeStyle})>.memo`]: {
      color: '#888'
    },

    '&>li>input': {
      verticalAlign: 'middle'
    },

    [`&>li.${activeStyle} .jp-icon-selectable[fill]`]: {
      fill: '#fff'
    }
  }
});

export const divListStyle = style({
  margin: 0,
  padding: 0,
  paddingLeft: 10,
  paddingRight: 10,
  userSelect: 'none',
  lineHeight: '25px',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  $nest: {
    [`&:hover:not(.${activeStyle})`]: {
      background: 'var(--jp-layout-color2)'
    },
    '&>span:first-child': {
      marginRight: 5
      //verticalAlign: 'text-top'
    },
    '&>.name': {
      marginRight: 5,
      fontWeight: 'bold',
      maxWidth: '100%',
      /*minWidth: '30%',*/
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      height: 25,
      whiteSpace: 'nowrap'
    },
    '&>.memo': {
      marginRight: 5,
      height: 25,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },

    [`&:not(.${activeStyle})>.memo`]: {
      color: '#888'
    },

    [`&.${activeStyle} .jp-icon-selectable[fill]`]: {
      fill: '#fff'
    }
  }
});

// for dialog width 300px
export const dlgStyle300 = style({
  width: 300,
  $nest: {
    '& input': {
      width: '100%'
    }
  }
});

export const hrStyle = style({
  border: 'none',
  borderTop: '1px solid #bbb',
  margin: '3px 0',
  padding: 0
});

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

export const errStyle = style({
  color: 'red'
});

// --- Reset Toolbar ---
export const toolbarStyle = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px',
  borderBottom: '1px solid var(--jp-border-color2)',
  background: 'var(--jp-layout-color1)',
  gap: '8px',
  flexShrink: 0
});

export const toolbarInfoStyle = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  overflow: 'hidden',
  $nest: {
    '& .conn-name': {
      fontWeight: 600,
      fontSize: 'var(--jp-ui-font-size1)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    '& .conn-host': {
      fontSize: 'var(--jp-ui-font-size0)',
      color: 'var(--jp-ui-font-color2)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }
});

export const resetBtnStyle = style({
  padding: '4px 12px',
  fontSize: 'var(--jp-ui-font-size1)',
  border: '1px solid var(--jp-border-color1)',
  borderRadius: '3px',
  background: 'var(--jp-layout-color2)',
  color: 'var(--jp-ui-font-color1)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  $nest: {
    '&:hover:not(:disabled)': {
      background: 'var(--jp-layout-color3)',
      borderColor: 'var(--jp-brand-color1)'
    },
    '&:disabled': {
      opacity: 0.5,
      cursor: 'not-allowed'
    }
  }
});

// --- Inline Connection Form ---
export const connFormStyle = style({
  padding: '16px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  overflow: 'auto',
  height: '100%',
  boxSizing: 'border-box'
});

export const formTitleStyle = style({
  fontSize: '14px',
  fontWeight: 600,
  color: 'var(--jp-ui-font-color0)',
  margin: 0,
  paddingBottom: '4px',
  borderBottom: '1px solid var(--jp-border-color2)'
});

export const formGroupStyle = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px'
});

export const formFieldStyle = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
  $nest: {
    '& label': {
      fontSize: 'var(--jp-ui-font-size0)',
      fontWeight: 500,
      color: 'var(--jp-ui-font-color1)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px'
    },
    '& input, & select': {
      width: '100%',
      padding: '6px 8px',
      fontSize: 'var(--jp-ui-font-size1)',
      border: '1px solid var(--jp-border-color1)',
      borderRadius: '3px',
      background: 'var(--jp-layout-color0)',
      color: 'var(--jp-ui-font-color0)',
      boxSizing: 'border-box',
      outline: 'none'
    },
    '& input:focus, & select:focus': {
      borderColor: 'var(--jp-brand-color1)',
      boxShadow: '0 0 0 1px var(--jp-brand-color1)'
    },
    '& input::placeholder': {
      color: 'var(--jp-ui-font-color3)'
    }
  }
});

export const formRowStyle = style({
  display: 'flex',
  gap: '8px',
  $nest: {
    '& > *': {
      flex: 1,
      minWidth: 0
    }
  }
});

export const submitBtnStyle = style({
  padding: '8px 16px',
  fontSize: 'var(--jp-ui-font-size1)',
  fontWeight: 600,
  border: 'none',
  borderRadius: '3px',
  background: 'var(--jp-brand-color1)',
  color: '#fff',
  cursor: 'pointer',
  width: '100%',
  marginTop: '4px',
  $nest: {
    '&:hover:not(:disabled)': {
      background: 'var(--jp-brand-color0)'
    },
    '&:disabled': {
      opacity: 0.6,
      cursor: 'not-allowed'
    }
  }
});
