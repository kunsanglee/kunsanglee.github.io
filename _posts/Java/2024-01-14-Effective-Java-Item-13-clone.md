---
title: "Effective Java - 아이템 13: clone 재정의는 주의해서 진행하라"
categories:
  - Java
tags:
  - Effective Java
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---

**Cloneable은 복제해도 되는 클래스임을 명시하는 용도의 믹스인 인터페이스(mixin interface)**지만,<br> 의도한 목적을 제대로 이루지 못했다.

### Cloneable 인터페이스는 무슨 일을 할까?
이 인터페이스는 Object의 protected 메서드인 clone의 동작 방식을 결정한다.
Cloneable을 구현한 클래스의 인스턴스에서 clone을 호출하면 그 객체의 필드들을 하나하나 복사한 객체를 반환하며,
그렇지 않은 클래스의 인스턴스에서 호출하면 CloneNotSupportedException을 던진다.
실무에서 Cloneable을 구현한 클래스는 clone 메서드를 public으로 제공하며, 사용자는 당연히 복제가 제대로 이뤄지리라 기대한다.
이 기대를 만족시키려면 그 클래스와 모든 상위 클래스는 복잡하고, 강제할 수 없고, 허술하게 기술된 프로토콜을 지켜야만 하는데,
그 결과로 깨지기 쉽고, 위험하고, 모순적인 매커니즘이 탄생한다. 생성자를 호출하지 않고도 객체를 생성할 수 있게 되는 것이다.

```java
// 가변 상태를 참조하지 않는 클래스용 clone 메서드
@Override public PhoneNumber clone() {
    try {
        return (PhoneNumber) super.clone();
    } catch (CloneNotSupportedException e) {
        throw new AssertionError();
    }
}
```

이 메서드가 동작하게 하려면 PhoneNumber 클래스가 Cloneable 인터페이스를 구현해야 한다.
Object의 clone은 Object를 반환하지만 PhoneNumber의 clone은 PhoneNumber를 반환하게 했다.
자바가 공변 반환 타이핑(covariant return typing)을 지원하기 때문에 이렇게 하는 것이 가능하고, 권장되는 방식이다.
재정의한 메서드의 반환 타입은 상위 클래스의 메서그가 반환하는 타입의 하위 타입일 수 있다.

앞서의 구현이 클래스가 가변 객체를 참조하는 순간 재앙으로 돌변한다.
```java
public class Stack {
    private Object[] elements;
    private int size = 0;
    private static final int DEFAULT_INITIAL_CAPACITY = 16;
    
    public Stack() {
        this.elements = new Object[DEFAULT_INITIAL_CAPACITY];
    }

    public void push(Object e) {
        ensureCapacity();
        elements[size++] = e;
    }
    
    public Object pop() {
        if (size == 0) {
            throw new EmptyStackException();
        }
        Object result = elements[--size];
        elements[size] = null; // 다 쓴 참조 해제
        return result;
    }
    
    // 원소를 위한 공간을 적어도 하나 이상 확보한다.
    private void ensureCapacity() {
        if (elements.length == size) {
            elements = Arrays.copyOf(elements, 2 * size + 1);
        }
    }
}
```

clone 메서드가 단순히 super.clone의 결과를 그대로 반환한다면 반환된 Stack 인스턴스의 size 필드는 올바른 값을 갖겠지만,
**elements 필드는 원본 Stack 인스턴스와 똑같은 배열을 참조할 것이다.** 
원본이나 복제본 중 하나를 수정하면 다른 하나도 수정되어 불변식을 해친다.

clone 메서드는 사실상 생성자와 같은 효과를 낸다. <br>
즉, **clone 원본 객체에 아무런 해를 끼치지 않는 동시에 복제된 객체의 불변식을 보장해야 한다.**

Stack의 clone 메서드는 제대로 동작하려면 스택 내부 정보를 복사해야 하는데 가장 쉬운 방법은 elements 배열의 clone을 재귀적으로 호출하는 것이다.

```java
@Override public Stack clone() {
    try {
        Stack result = (Stack) super.clone();
        result.elements = elements.clone();
        return result;
    } catch (CloneNotSupportedException e) {
        throw new AssertionError();
    }
}
```

배열의 clone은 런타임 타입과 컴파일타임 타입 모두가 원본 배열과 똑같은 배열을 반환한다.<br>
따라서 배열을 복제할 때는 배열의 clone 메서드를 사용하라고 권장한다. 배열은 clone 기능을 제대로 사용하는 유일한 예다.

한 편 elements 필드가 final이었다면 앞서의 방식은 작동하지 않는다. final 필드에는 새로운 값을 할당할 수 없기 때문이다.
이는 근본적인 문제로, 직렬화와 마찬가지로 Cloneable 아키텍처는 '가변 객체를 참조하는 필드는 final로 선언하라'는 일반 용법과 충돌한다.

상속용 클래스는 Cloneable을 구현해서는 안된다.

Cloneable을 구현한 스레드 안전 클래스를 작성할 때는 clone 메서드 역시 적절히 동기화해줘야 한다.
Object의 clone 메서드는 동기화를 신경쓰지 않았기 때문에 super.clone 호출 외에 다른 할 일이 없더라도 clone을 재정의하고 동기화해줘야 한다.

요약하자면, Cloneable을 구현하는 모든 클래스는 clone을 재정의해야 한다. 이때 접근 제한자는 public으로, 반환 타입은 클래스 자신으로 변경한다.
이 메서드는 가장 먼저 super.clone을 호출한 후 필요한 필드를 전부 적절히 수정한다.
이 말은 객체의 내부 '깊은 구조'에 숨어있는 모든 가변 객체를 복사하고, 복제본이 가진 객체 참조 모두가 복사된 객체들을 가리키게 함을 뜻한다.

Cloneable을 이미 구현한 클래스를 확장한다면 어쩔 수 없이 clone을 잘 작동하도록 구현해야 한다.
그렇지 않은 상황에서는 복사 생성자와 복사 팩터리라는 더 나은 객체 복사 방식을 제공할 수 있다.
복사 생성자란 단순히 자신과 같은 클래스의 인스턴스를 인수로 받는 생성자다.

복사 생성자와 그 변형인 복사 팩터리는 Cloneable/clone 방식보다 나은 면이 많다.
언어 모순적이고 위험천만한 객체 생성 메커니즘(생성자를 쓰지 않는 방식)을 사용하지 않으며, 정상적인 final필드 용법과도 충돌하지 않으며,
불필요한 검사 예외를 던지지도 않고, 형변환도 필요치 않다.
게다가 복사 생성자와 복사 팩터리는 해당 클래스가 구현한 '인터페이스'타입의 인스턴스를 인수로 받을 수 있다.

### 핵심 정리
새로운 인터페이스를 만들 때는 절대 Cloneable을 확장해서는 안 되며, 새로운 클래스도 이를 구현해서는 안 된다.<br>
기본 원칙은 '복제 기능은 생성자와 팩터리를 이용하는게 최고'라는 것이다.<br>
단, 배열만은 clone 메서드 방식이 가장 깔끔한, 이 규칙의 합당한 예외라 할 수 있다.
