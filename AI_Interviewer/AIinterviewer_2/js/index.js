document.addEventListener('DOMContentLoaded', function () {
    const nextButton = document.getElementById('next-button');
    const errorMessage = document.createElement('div');
    errorMessage.id = 'form-error';
    errorMessage.style.color = 'red';
    errorMessage.style.marginTop = '8px';
    errorMessage.style.fontSize = '14px';
    errorMessage.style.display = 'none';
    document.querySelector('.form').appendChild(errorMessage);
  
    nextButton.addEventListener('click', function (e) {
      e.preventDefault();
  
      const fields = [
        { id: 'name', label: '氏名' },
        { id: 'email', label: 'メールアドレス' },
        { id: 'interview-number', label: '面接番号' },
        { id: 'birthdate', label: '生年月日' }
      ];
  
      let hasEmpty = false;
      errorMessage.style.display = 'none';
      errorMessage.textContent = '';
  
      fields.forEach(field => {
        const input = document.getElementById(field.id);
        input.classList.remove('shake');
        input.style.backgroundColor = '#DADADA'; // 統一された背景色
        input.style.border = input.value.trim() ? 'none' : '2px solid red';
  
        if (!input.value.trim()) {
          hasEmpty = true;
          input.classList.add('shake');
          setTimeout(() => input.classList.remove('shake'), 400);
        }
      });
  
      const email = document.getElementById('email');
      const emailVal = email.value.trim();
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (emailVal && !emailPattern.test(emailVal)) {
        errorMessage.textContent = "正しいメールアドレスを入力してください。";
        errorMessage.style.display = 'block';
        email.classList.add('shake');
        email.style.border = '2px solid red';
        setTimeout(() => email.classList.remove('shake'), 400);
        return;
      }
  
      if (hasEmpty) {
        errorMessage.textContent = "すべての項目を入力してください。";
        errorMessage.style.display = 'block';
        return;
      }
  
      // 入力完了 → 保存
      localStorage.setItem("intervieweeName", document.getElementById("name").value);
      localStorage.setItem("email", document.getElementById("email").value);
      localStorage.setItem("interviewNumber", document.getElementById("interview-number").value);
      localStorage.setItem("birthdate", document.getElementById("birthdate").value);
  
      window.location.href = "introduction.html";
    });
  });
  
  