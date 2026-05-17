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

// --- Connection Form (3-part layout: fixed header, scrollable body, fixed footer) ---
export const connFormStyle = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  boxSizing: 'border-box',
  background: 'var(--jp-layout-color1)',
  overflow: 'hidden'
});

export const connFormHeader = style({
  padding: '16px 14px 0 14px',
  flexShrink: 0
});

export const connFormBody = style({
  flex: 1,
  overflowY: 'auto',
  padding: '0 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  paddingTop: '14px',
  paddingBottom: '14px'
});

export const formHeaderStyle = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px'
});

export const formHeaderIconStyle = style({
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  borderRadius: '50%',
  background: 'var(--jp-layout-color2)'
});

export const formHeaderTextStyle = style({
  minWidth: 0,
  flex: 1,
  $nest: {
    '& .title': {
      fontSize: '14px',
      fontWeight: 700,
      color: 'var(--jp-ui-font-color0)',
      lineHeight: '1.3',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    '& .subtitle': {
      fontSize: '11px',
      color: 'var(--jp-ui-font-color2)',
      lineHeight: '1.3',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }
});

export const formDivider = style({
  border: 'none',
  borderTop: '1px solid var(--jp-border-color2)',
  margin: '2px 0',
  padding: 0
});

export const formSectionTitle = style({
  fontSize: '11px',
  fontWeight: 700,
  color: 'var(--jp-ui-font-color1)',
  letterSpacing: '0.8px',
  textTransform: 'uppercase',
  margin: 0,
  padding: 0
});

export const formGroupStyle = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px'
});

export const formFieldStyle = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  $nest: {
    '& label': {
      fontSize: '12px',
      fontWeight: 600,
      color: 'var(--jp-ui-font-color0)'
    },
    '& input, & select': {
      width: '100%',
      padding: '7px 10px',
      fontSize: '13px',
      border: '1px solid var(--jp-border-color1)',
      borderRadius: '4px',
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
      color: 'var(--jp-ui-font-color3)',
      fontSize: '12px'
    }
  }
});

export const formOptionalLabel = style({
  fontWeight: 400,
  fontSize: '10px',
  color: 'var(--jp-ui-font-color2)',
  textTransform: 'lowercase',
  marginLeft: '4px'
});

export const formRowStyle = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  $nest: {
    '& > *': {
      // grow + shrink with a 140px basis: two fields sit side-by-side when
      // the row has room (>= ~290px), otherwise they wrap onto separate lines.
      flex: '1 1 140px',
      minWidth: 0
    }
  }
});

export const dbTypePicker = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
  marginTop: '2px'
});

export const dbTypeOption = style({
  padding: '4px 12px',
  fontSize: '12px',
  fontWeight: 500,
  border: '1px solid var(--jp-border-color1)',
  borderRadius: '16px',
  background: 'var(--jp-layout-color0)',
  color: 'var(--jp-ui-font-color1)',
  cursor: 'pointer',
  outline: 'none',
  $nest: {
    '&:hover': {
      borderColor: 'var(--jp-brand-color1)',
      background: 'var(--jp-layout-color2)'
    },
    '&::before': {
      content: "'\\2022'",
      marginRight: '4px',
      color: 'var(--jp-ui-font-color3)'
    }
  }
});

export const dbTypeOptionSelected = style({
  padding: '4px 12px',
  fontSize: '12px',
  fontWeight: 600,
  border: '1.5px solid var(--jp-brand-color1)',
  borderRadius: '16px',
  background: 'var(--jp-layout-color2)',
  color: 'var(--jp-brand-color1)',
  cursor: 'pointer',
  outline: 'none',
  $nest: {
    '&::before': {
      content: "'\\2022'",
      marginRight: '4px',
      color: 'var(--jp-brand-color1)'
    }
  }
});

// `container-type: inline-size` lets the @container rules below stack the
// buttons full-width when the bar itself is narrow, regardless of the
// surrounding panel. (Cast: the bundled csstype is older than container
// query support.)
export const formBottomBar = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '8px',
  padding: '10px 14px',
  borderTop: '1px solid var(--jp-border-color2)',
  flexShrink: 0,
  background: 'var(--jp-layout-color1)',
  ...({ containerType: 'inline-size' } as any)
});

// Pushes the leading button (Test connection) to the far left at wide
// widths; below the breakpoint it spans the full row so subsequent buttons
// stack underneath it.
export const formBottomBarLead = style({
  marginRight: 'auto',
  $nest: {
    '@container (max-width: 290px)': {
      marginRight: 0,
      width: '100%'
    }
  }
});

// Groups Cancel + Create so the bottom bar has two flex children. At wide
// widths the group sits right-aligned next to Test connection; below the
// breakpoint it spans the full row and stacks its buttons vertically, so
// Test, Cancel, and Create each occupy their own full-width line.
export const formBottomBarActions = style({
  display: 'flex',
  gap: '8px',
  marginLeft: 'auto',
  flex: '0 1 auto',
  $nest: {
    '@container (max-width: 290px)': {
      marginLeft: 0,
      width: '100%',
      flexDirection: 'column',
      $nest: {
        '& > *': {
          width: '100%'
        }
      }
    }
  }
});

export const formBtnOutline = style({
  padding: '6px 16px',
  fontSize: '13px',
  fontWeight: 600,
  border: '1px solid var(--jp-border-color1)',
  borderRadius: '4px',
  background: 'var(--jp-layout-color0)',
  color: 'var(--jp-ui-font-color0)',
  cursor: 'pointer',
  $nest: {
    '&:hover:not(:disabled)': {
      background: 'var(--jp-layout-color2)',
      borderColor: 'var(--jp-ui-font-color2)'
    },
    '&:disabled': {
      opacity: 0.5,
      cursor: 'not-allowed'
    }
  }
});

export const formBtnPrimary = style({
  padding: '6px 16px',
  fontSize: '13px',
  fontWeight: 600,
  border: '1px solid var(--jp-border-color1)',
  borderRadius: '4px',
  background: 'var(--jp-layout-color0)',
  color: 'var(--jp-ui-font-color0)',
  cursor: 'pointer',
  $nest: {
    '&:hover:not(:disabled)': {
      background: 'var(--jp-layout-color2)',
      borderColor: 'var(--jp-brand-color1)'
    },
    '&:disabled': {
      opacity: 0.5,
      cursor: 'not-allowed'
    }
  }
});

export const formBtnTest = style({
  padding: '6px 16px',
  fontSize: '13px',
  fontWeight: 600,
  border: '1px solid var(--jp-brand-color1)',
  borderRadius: '4px',
  background: 'var(--jp-layout-color0)',
  color: 'var(--jp-brand-color1)',
  cursor: 'pointer',
  $nest: {
    '&:hover:not(:disabled)': {
      background: 'var(--jp-brand-color4, var(--jp-layout-color2))'
    },
    '&:disabled': {
      opacity: 0.5,
      cursor: 'not-allowed'
    }
  }
});

export const formTestSuccess = style({
  color: 'var(--jp-success-color1, #388e3c)',
  fontSize: '12px',
  fontWeight: 500,
  padding: '4px 0'
});

// --- DB tree view ---
export const treeToolbarStyle = style({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  paddingBottom: 4
});

// minHeight: 0 is required — without it a flex child won't shrink below its
// intrinsic content height and overflow:auto becomes a no-op.
export const treeContainerStyle = style({
  flex: '1 1 auto',
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden'
});

export const treeRowStyle = style({
  display: 'flex',
  alignItems: 'center',
  lineHeight: '22px',
  cursor: 'pointer',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  paddingRight: 6,
  $nest: {
    [`&:hover:not(.${activeStyle})`]: {
      background: 'var(--jp-layout-color2)'
    },
    [`&.${activeStyle} .jp-icon-selectable[fill]`]: {
      fill: '#fff'
    }
  }
});

export const treeChevronStyle = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 14,
  height: 14,
  flexShrink: 0,
  opacity: 0.7,
  marginRight: 2
});

export const treeIconStyle = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 16,
  height: 16,
  flexShrink: 0,
  marginRight: 4
});

export const treeNameStyle = style({
  fontWeight: 'bold',
  marginRight: 6,
  overflow: 'hidden',
  textOverflow: 'ellipsis'
});

export const treeMemoStyle = style({
  color: '#888',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  flex: '0 1 auto',
  minWidth: 0,
  $nest: {
    [`.${activeStyle} &`]: {
      color: 'var(--jp-ui-inverse-font-color2)'
    }
  }
});

export const treeGroupStyle = style({
  fontStyle: 'italic',
  color: 'var(--jp-ui-font-color2)',
  marginRight: 6
});

export const treeErrorBadgeStyle = style({
  marginLeft: 6,
  flexShrink: 0
});

export const treeSpinnerStyle = style({
  boxSizing: 'border-box',
  width: 10,
  height: 10,
  borderRadius: '50%',
  border: '2px solid rgba(0, 0, 0, 0.25)',
  borderTopColor: 'var(--jp-brand-color1, #1976d2)',
  marginLeft: 6,
  flexShrink: 0,
  animationName: spinStyle,
  animationDuration: '1s',
  animationIterationCount: 'infinite',
  animationTimingFunction: 'linear'
});
