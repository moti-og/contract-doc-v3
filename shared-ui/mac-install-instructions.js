// Mac Installation Instructions
// Used by InstallAddInModal in components.react.js

export const macInstallInstructions = {
  title: '🍎 Mac Installation Guide',
  
  steps: [
    {
      id: 'step1',
      title: 'Step 1/8: Locate the Downloaded Installer',
      description: 'Find the WordFTW-Add-in-Installer.pkg file in your Downloads folder:',
      image: '/1-download-folder.png',
      imageAlt: 'Downloaded installer in Downloads folder',
      backgroundColor: '#f9fafb',
      borderColor: '#e5e7eb',
      textColor: '#1f2937'
    },
    {
      id: 'step2',
      title: 'Step 2/8: Security Warning',
      description: 'Do not worry! Mac is automatically blocking this installation so people do not install malware. This is a standard setting. When you double click the file, you will see this security warning. There is nothing we can do about it and it will not do damage. Just click "Done" and do not delete! Otherwise you have to reset the cycle.',
      image: '/2-download-error.png',
      imageAlt: 'Security warning dialog',
      backgroundColor: '#f9fafb',
      borderColor: '#e5e7eb',
      textColor: '#1f2937'
    },
    {
      id: 'step3',
      title: 'Step 3/8: Approve in System Settings',
      description: 'Now it is time to install the add-in.Go to System Settings → Privacy & Security and click "Open Anyway" to approve the installer. This is required by Mac, given the security controls. There will be another couple clicks, but you are almost there!',
      image: '/3-security-approval.png',
      imageAlt: 'Security approval in System Settings',
      backgroundColor: '#f9fafb',
      borderColor: '#e5e7eb',
      textColor: '#1f2937'
    },
    {
      id: 'step4',
      title: 'Step 4/8: Confirm Installation',
      description: 'Click "Open anyway" when macOS asks you to confirm. This is another layer of security, but all you are doing is continuing the installation.',
      image: '/4-install-confirmation.png',
      imageAlt: 'Installation confirmation dialog',
      backgroundColor: '#f9fafb',
      borderColor: '#e5e7eb',
      textColor: '#1f2937'
    },
    {
      id: 'step5',
      title: 'Step 5/8: Grant App Access',
      description: 'The installer will ask for permission to access your files. This is necessary since the add-in is working with Word. If you say no, it cannot work with Word, or Word files. Click "Allow"',
      image: '/5-app-access.png',
      imageAlt: 'App access permission dialog',
      backgroundColor: '#f9fafb',
      borderColor: '#e5e7eb',
      textColor: '#1f2937'
    },
    {
      id: 'step6',
      title: 'Step 6/8: Word Opens Automatically',
      description: 'After installation completes, Word will open automatically with a sample document. You only have one step after that!',
      image: '/6-initial-doc.png',
      imageAlt: 'Word opens with document',
      backgroundColor: '#f9fafb',
      borderColor: '#e5e7eb',
      textColor: '#1f2937'
    },
    {
      id: 'step7',
      title: 'Step 7/8: Open the Add-in',
      description: 'Now you can open the Add-in! Just click that red grid in your ribbon and click on the "OpenGov Contracting" Add-in. In the future, customers will simply come here and search for OpenGov, just like a mobile app in the app store. If you have made it this far, you are getting the earliest of sneak previews!',
      image: '/7-open-add-in.png',
      imageAlt: 'Opening the add-in in Word',
      backgroundColor: '#f9fafb',
      borderColor: '#e5e7eb',
      textColor: '#1f2937'
    }
  ],
  
  linkCodeSection: {
    title: 'Step 8/8: Link with your browser via a code',
    description: 'Now you need to connect your browser with the Add-in. Close this modal and generate a code by clicking "open in word" again, then click on the three dots next to the "checkout" button, and enter the link code from the browser. And then, you are off to the races!',
    instructions: [
      'Click the 3 dots menu (⋮) at the top of the add-in panel',
      'Select "Enter Link Code"',
      'Paste this code and click "Submit"',
      'The add-in will connect to your browser'
    ],
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
    textColor: '#1e40af'
  },
  
  buttonText: {
    copy: '📋 Copy Code',
    copied: '✓ Copied!',
    done: 'Done'
  }
};

